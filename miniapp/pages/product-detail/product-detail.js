// pages/product-detail/product-detail.js
const { callCloud, callCloudWithLogin } = require('../../utils/cloud-api')
const { addCartItem, canAddProductToCart, getCartBadgeCount } = require('../../utils/cart')

Page({
    data: {
        product: null,
        campaign: null,
        cartCount: 0,
        cartEligible: false,
        packageItems: null,
        packageValidDays: 180,
        deliveryLabel: '',
        showBuyModal: false,
        quantity: 1,
        totalAmountYuan: '0',
        loading: true,
        paying: false,
        inviterOpenid: ''
    },

    onLoad: function (options) {
        const { id, inviter } = options
        if (inviter) {
            this.setData({ inviterOpenid: inviter })
            const app = getApp()
            app.setInviter(inviter)
        }
        this.refreshCartCount()
        if (id) this._loadProduct(id)
    },

    onShow: function () {
        this.refreshCartCount()
    },

    onUnload: function () {
        if (this._redirectTimer) clearTimeout(this._redirectTimer)
    },

    _loadProduct: async function (productId) {
        this.setData({ loading: true })
        try {
            const detail = await callCloud('commerceApi', {
                action: 'getProductDetail',
                productId
            })

            const product = { ...detail.product }
            product.priceYuan = (product.price / 100).toFixed(1)
            product.originalPriceYuan = product.originalPrice ? (product.originalPrice / 100).toFixed(1) : '0.0'
            if (product.originalPrice > 0 && product.originalPrice > product.price) {
                product.discountText = Math.round(product.price / product.originalPrice * 10) + '折'
            }

            const deliveryMap = { express: '📦 快递发货', pickup: '🏪 到店自取', instore: '🏥 到店使用' }
            const deliveryLabel = deliveryMap[product.deliveryType] || '到店使用'

            // 查找当前商品对应的裂变活动
            let campaign = detail.campaign || null
            if (campaign) {
                campaign.cashbackAmountYuan = (campaign.cashbackAmount / 100).toFixed(1)
                campaign.activityPriceYuan = (campaign.activityPrice / 100).toFixed(1)
            }

            let packageItems = null
            let packageValidDays = 180
            if (detail.packageDetail) {
                packageItems = detail.packageDetail.items || null
                packageValidDays = detail.packageDetail.validDays || 180
            }

            this.setData({
                product,
                campaign,
                cartEligible: canAddProductToCart(product, campaign).ok,
                deliveryLabel,
                packageItems,
                packageValidDays,
                loading: false
            })
            this._updateTotal()
            wx.setNavigationBarTitle({ title: product.name })
        } catch (e) {
            this.setData({ loading: false })
            wx.showToast({ title: e.message || '加载失败', icon: 'none' })
        }
    },

    _updateTotal: function () {
        const { product, campaign, quantity } = this.data
        if (!product) return
        const unitPrice = campaign ? campaign.activityPrice : product.price
        const total = (unitPrice * quantity / 100).toFixed(1)
        this.setData({ totalAmountYuan: total })
    },

    onBuy: function () {
        const app = getApp()
        if (!app.requireCustomerLogin(`/pages/product-detail/product-detail?id=${this.data.product && this.data.product._id}`, { content: '请先绑定手机号后再购买' })) {
            return
        }
        this.setData({ showBuyModal: true, quantity: 1 })
        this._updateTotal()
    },

    closeBuyModal: function () {
        this.setData({ showBuyModal: false })
    },

    noop: function () { },

    incQuantity: function () {
        const { product, campaign, quantity } = this.data
        // 裂变活动商品限购 1 件
        if (campaign && quantity >= (campaign.limitPerUser || 1)) {
            wx.showToast({ title: `活动商品每人限购 ${campaign.limitPerUser || 1} 件`, icon: 'none' })
            return
        }
        if (product.stock !== -1 && quantity >= product.stock) {
            wx.showToast({ title: '库存不足', icon: 'none' })
            return
        }
        this.setData({ quantity: quantity + 1 })
        this._updateTotal()
    },

    decQuantity: function () {
        if (this.data.quantity <= 1) return
        this.setData({ quantity: this.data.quantity - 1 })
        this._updateTotal()
    },

    // ─── 核心：下单 → 支付 两步走 ───────────────────────

    confirmBuy: async function () {
        if (this.data.paying) return
        const app = getApp()
        if (!app.requireCustomerLogin(`/pages/product-detail/product-detail?id=${this.data.product && this.data.product._id}`, { content: '请先绑定手机号后再支付' })) {
            return
        }
        const { product, campaign, quantity, inviterOpenid } = this.data
        this.setData({ paying: true })
        wx.showLoading({ title: '创建订单...', mask: true })

        try {
            // Step 1：创建订单
            const createRes = await callCloudWithLogin('commerceApi', {
                action: 'createOrder',
                productId: product._id,
                quantity,
                inviterOpenid: inviterOpenid || app.globalData._pendingInviter || '',
                fissionCampaignId: campaign ? campaign._id : ''
            })

            const { orderId } = createRes
            this.setData({ showBuyModal: false })
            wx.showLoading({ title: '拉起支付...', mask: true })

            // Step 2：发起微信支付
            let payRes
            try {
                payRes = await callCloudWithLogin('commerceApi', {
                    action: 'requestPay',
                    orderId
                })
            } catch (error) {
                wx.hideLoading()
                if (error.code === -2) {
                    wx.showModal({
                        title: '支付功能待配置',
                        content: '请在云开发控制台开通"云支付"功能并绑定商户号后再使用',
                        showCancel: false
                    })
                    this.setData({ paying: false })
                    return
                }
                throw error
            }
            wx.hideLoading()

            const { payment } = payRes

            // Step 3：调起微信收银台
            await wx.requestPayment({
                timeStamp: payment.timeStamp,
                nonceStr:  payment.nonceStr,
                package:   payment.package,
                signType:  payment.signType,
                paySign:   payment.paySign
            })

            // Step 4：支付成功
            wx.showToast({ title: '支付成功 🎉', icon: 'success', duration: 2000 })
            // 跳转到套餐/订单页
            this._redirectTimer = setTimeout(() => {
                if (product.type === 'service' || product.type === 'package') {
                    wx.navigateTo({ url: '/pages/package-usage/package-usage' })
                } else {
                    wx.navigateBack()
                }
            }, 1500)

        } catch (err) {
            wx.hideLoading()
            const errMsg = (err.errMsg || err.message || '').toLowerCase()
            if (errMsg.includes('cancel') || errMsg.includes('用户取消')) {
                wx.showToast({ title: '已取消支付', icon: 'none' })
            } else {
                console.error('支付异常:', err)
                wx.showToast({ title: '支付遇到问题，请重试', icon: 'none', duration: 3000 })
            }
        } finally {
            this.setData({ paying: false })
        }
    },

    goToFissionDetail: function () {
        wx.navigateTo({ url: '/pages/fission/fission' })
    },

    addToCart: function () {
        const { product, campaign } = this.data
        if (!product) return

        const eligibility = canAddProductToCart(product, campaign)
        if (!eligibility.ok) {
            wx.showToast({ title: eligibility.reason, icon: 'none' })
            return
        }

        try {
            addCartItem(product, 1)
            this.refreshCartCount()
            wx.showToast({ title: '已加入购物车', icon: 'success' })
        } catch (error) {
            wx.showToast({ title: error.message || '加入购物车失败', icon: 'none' })
        }
    },

    refreshCartCount: function () {
        this.setData({ cartCount: getCartBadgeCount() })
    },

    goToCart: function () {
        wx.navigateTo({ url: '/pages/cart/cart' })
    },

    onShare: function () {
        wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage'] })
    },

    onShareAppMessage: function () {
        const { product, campaign } = this.data
        const app = getApp()
        const openid = app.globalData.openid || ''
        return {
            title: campaign
                ? `🔥 仅需¥${campaign.activityPriceYuan}，分享还能赚¥${campaign.cashbackAmountYuan}！`
                : `推荐：${product?.name}`,
            path: `/pages/product-detail/product-detail?id=${product?._id}&inviter=${openid}`,
            imageUrl: product?.images?.[0] || ''
        }
    },

    onShareTimeline: function () {
        const { product, campaign } = this.data
        const app = getApp()
        const openid = app.globalData.openid || ''
        return {
            title: campaign
                ? `🔥 仅需¥${campaign.activityPriceYuan}，${product?.name}`
                : product?.name || '浴小主小儿推拿',
            query: `id=${product?._id}&inviter=${openid}`,
            imageUrl: product?.images?.[0] || ''
        }
    }
})
