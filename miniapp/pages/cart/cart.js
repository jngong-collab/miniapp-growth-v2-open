const { callCloudWithLogin } = require('../../utils/cloud-api')
const {
    getCartItems,
    getCartSummary,
    removeCartItem,
    removeCartItems,
    setCartItemChecked,
    toggleAllCartItems,
    updateCartItemQuantity
} = require('../../utils/cart')

Page({
    data: {
        items: [],
        allSelected: false,
        selectedCount: 0,
        selectedQuantity: 0,
        totalAmountYuan: '0.00',
        submitting: false
    },

    onShow() {
        this.loadCart()
    },

    onUnload() {
        if (this._redirectTimer) clearTimeout(this._redirectTimer)
        if (this._navigateTimer) clearTimeout(this._navigateTimer)
    },

    loadCart() {
        const items = getCartItems()
        const summary = getCartSummary(items.filter(item => item.checked))
        this.setData({
            items,
            allSelected: items.length > 0 && items.every(item => item.checked),
            selectedCount: summary.selectedCount,
            selectedQuantity: summary.selectedQuantity,
            totalAmountYuan: summary.totalAmountYuan
        })
    },

    toggleItem(e) {
        const productId = e.currentTarget.dataset.id
        const targetItem = this.data.items.find(item => item.productId === productId)
        if (!targetItem) return
        setCartItemChecked(productId, !targetItem.checked)
        this.loadCart()
    },

    toggleAll() {
        toggleAllCartItems(!this.data.allSelected)
        this.loadCart()
    },

    incQuantity(e) {
        const productId = e.currentTarget.dataset.id
        const targetItem = this.data.items.find(item => item.productId === productId)
        if (!targetItem) return
        if (targetItem.stock !== -1 && targetItem.quantity >= targetItem.stock) {
            wx.showToast({ title: '库存不足', icon: 'none' })
            return
        }
        updateCartItemQuantity(productId, targetItem.quantity + 1)
        this.loadCart()
    },

    decQuantity(e) {
        const productId = e.currentTarget.dataset.id
        const targetItem = this.data.items.find(item => item.productId === productId)
        if (!targetItem || targetItem.quantity <= 1) return
        updateCartItemQuantity(productId, targetItem.quantity - 1)
        this.loadCart()
    },

    removeItem(e) {
        removeCartItem(e.currentTarget.dataset.id)
        this.loadCart()
        wx.showToast({ title: '已移出购物车', icon: 'none' })
    },

    goToProduct(e) {
        const id = e.currentTarget.dataset.id
        if (!id) return
        wx.navigateTo({ url: `/pages/product-detail/product-detail?id=${id}` })
    },

    goToMall() {
        wx.switchTab({ url: '/pages/mall/mall' })
    },

    async checkout() {
        if (this.data.submitting || !this.data.selectedCount) return

        const app = getApp()
        if (app && typeof app.requireCustomerLogin === 'function') {
            if (!app.requireCustomerLogin('/pages/cart/cart?from=checkout', { content: '请先绑定手机号后再去支付' })) {
                return
            }
        } else if (!app?.globalData?.openid) {
            wx.showToast({ title: '请稍候，正在登录...', icon: 'none' })
            return
        }

        const checkoutItems = this.data.items
            .filter(item => item.checked)
            .map(item => ({ productId: item.productId, quantity: item.quantity }))
        if (!checkoutItems.length) return

        this.setData({ submitting: true })
        wx.showLoading({ title: '创建订单...', mask: true })

        try {
            const createRes = await callCloudWithLogin('commerceApi', {
                action: 'createCartOrder',
                items: checkoutItems
            })

            wx.showLoading({ title: '拉起支付...', mask: true })
            let payRes
            try {
                payRes = await callCloudWithLogin('commerceApi', {
                    action: 'requestPay',
                    orderId: createRes.orderId
                })
            } catch (error) {
                wx.hideLoading()
                if (error.code === -2) {
                    wx.showModal({
                        title: '支付功能待配置',
                        content: '请在云开发控制台开通"云支付"功能并绑定商户号后再使用',
                        showCancel: false
                    })
                    return
                }
                throw error
            }

            wx.hideLoading()

            const { payment } = payRes
            await wx.requestPayment({
                timeStamp: payment.timeStamp,
                nonceStr: payment.nonceStr,
                package: payment.package,
                signType: payment.signType,
                paySign: payment.paySign
            })

            removeCartItems(checkoutItems.map(item => item.productId))
            this.loadCart()
            wx.showToast({ title: '支付成功', icon: 'success', duration: 2000 })
            this._redirectTimer = setTimeout(() => {
                wx.redirectTo({ url: '/pages/orders/orders?status=paid' })
            }, 1200)
        } catch (error) {
            wx.hideLoading()
            const errMsg = String(error.errMsg || error.message || '').toLowerCase()
            if (errMsg.includes('cancel') || errMsg.includes('用户取消')) {
                wx.showToast({ title: '已取消支付，可在订单页继续支付', icon: 'none', duration: 2500 })
                this._navigateTimer = setTimeout(() => {
                    wx.navigateTo({ url: '/pages/orders/orders?status=pending' })
                }, 800)
                return
            }
            wx.showToast({ title: error.message || '结算失败，请重试', icon: 'none', duration: 2500 })
        } finally {
            this.setData({ submitting: false })
        }
    }
})
