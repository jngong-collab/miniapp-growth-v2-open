// pages/fission/fission.js
const { callCloud } = require('../../utils/cloud-api')

Page({
    data: {
        campaigns: [],
        earnings: null,
        records: [],
        balanceYuan: '0',
        totalEarnedYuan: '0',
        loading: true
    },

    onLoad: function (options) {
        // 关键：处理分享链接中的 inviter 参数
        if (options.inviter) {
            const app = getApp()
            app.setInviter(options.inviter)
        }
        this._loadAll()
    },
    onShow: function () { this._loadEarnings() },
    onPullDownRefresh: async function () {
        await this._loadAll()
        wx.stopPullDownRefresh()
    },

    _loadAll: async function () {
        await Promise.all([this._loadCampaigns(), this._loadEarnings(), this._loadRecords()])
        this.setData({ loading: false })
    },

    _loadCampaigns: async function () {
        try {
            const homeRes = await callCloud('contentApi', { action: 'getHomeContent' })
            const campaignList = (homeRes.fissionCampaigns || []).map(c => {
                const remaining = c.totalStock - c.soldCount
                return {
                    ...c,
                    activityPriceYuan: (c.activityPrice / 100).toFixed(1),
                    cashbackAmountYuan: (c.cashbackAmount / 100).toFixed(1),
                    remainingStock: remaining > 0 ? remaining : 0,
                    soldPercent: c.totalStock > 0 ? Math.min(Math.round(c.soldCount / c.totalStock * 100), 100) : 0
                }
            })
            this.setData({ campaigns: campaignList })

            const detailTasks = campaignList.map((campaign, i) => {
                if (!campaign.productId) return null
                return callCloud('commerceApi', { action: 'getProductDetail', productId: campaign.productId })
                    .then(productRes => {
                        if (!productRes?.product) return null
                        const product = productRes.product
                        return {
                            index: i,
                            productDetail: {
                                description: product.description || '',
                                detail: product.detail || '',
                                efficacy: product.efficacy || '',
                                images: product.images || [],
                                type: product.type || 'service',
                                originalPriceYuan: product.originalPrice ? (product.originalPrice / 100).toFixed(1) : ''
                            }
                        }
                    })
                    .catch(() => null)
            }).filter(Boolean)
            const details = (await Promise.all(detailTasks)).filter(Boolean)
            const updates = {}
            details.forEach(d => { updates[`campaigns[${d.index}].productDetail`] = d.productDetail })
            if (Object.keys(updates).length) this.setData(updates)
        } catch (e) {
            console.error('加载活动失败:', e)
            wx.showToast({ title: '活动加载失败', icon: 'none' })
        }
    },

    _loadEarnings: async function () {
        try {
            const d = await callCloud('growthApi', { action: 'getMyEarnings' })
            this.setData({
                earnings: d,
                balanceYuan: (d.balance / 100).toFixed(1),
                totalEarnedYuan: (d.totalEarned / 100).toFixed(1)
            })
        } catch (e) {
            console.error('加载收益失败:', e)
            wx.showToast({ title: '收益加载失败', icon: 'none' })
        }
    },

    _loadRecords: async function () {
        try {
            const records = await callCloud('growthApi', { action: 'getMyFissionRecords' })
            const formatted = (records || []).map(r => ({
                ...r,
                cashbackAmountYuan: (r.cashbackAmount / 100).toFixed(1),
                createdAtStr: this._fmt(r.createdAt)
            }))
            this.setData({ records: formatted })
        } catch (e) {
            console.error('加载记录失败:', e)
            wx.showToast({ title: '记录加载失败', icon: 'none' })
        }
    },

    _fmt: function (date) {
        if (!date) return ''
        const d = new Date(date)
        return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    },

    buyNow: function (e) {
        const productId = e.currentTarget.dataset.productId
        if (!productId) return
        wx.navigateTo({ url: `/pages/product-detail/product-detail?id=${productId}` })
    },

    onShareAppMessage: function () {
        const app = getApp()
        const openid = app.globalData.openid || ''
        const campaigns = this.data.campaigns
        const title = campaigns.length === 1
            ? `🔥 仅需¥${campaigns[0].activityPriceYuan}买【${campaigns[0].productName}】，推荐给好友还能赚¥${campaigns[0].cashbackAmountYuan}！`
            : '🌿 多款返现活动进行中，分享好友轻松赚现金！'
        return {
            title,
            path: `/pages/fission/fission?inviter=${openid}`
        }
    }
})

