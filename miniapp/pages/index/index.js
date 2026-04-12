// pages/index/index.js
const config = require('../../config')
const { callCloud } = require('../../utils/cloud-api')

function getGreeting() {
    const hour = new Date().getHours()
    if (hour < 6) return { text: 'Hi, 夜深了', emoji: '🌙' }
    if (hour < 9) return { text: 'Hi, 早上好', emoji: '☀️' }
    if (hour < 12) return { text: 'Hi, 上午好', emoji: '🌤️' }
    if (hour < 14) return { text: 'Hi, 中午好', emoji: '🌞' }
    if (hour < 18) return { text: 'Hi, 下午好', emoji: '🍵' }
    if (hour < 21) return { text: 'Hi, 晚上好', emoji: '🌆' }
    return { text: 'Hi, 夜深了', emoji: '🌙' }
}

Page({
    data: {
        storeInfo: null,
        banners: [],
        fissionCampaigns: [],
        hotProducts: [],
        hotPackages: [],
        therapist: null,
        lotteryCampaign: null,
        loading: true,
        greeting: 'Hi, 你好',
        greetingEmoji: '👋'
    },

    onLoad: function (options) {
        // 设置时间问候语
        const g = getGreeting()
        this.setData({ greeting: g.text, greetingEmoji: g.emoji })

        // 处理分享来源
        if (options.inviter) {
            const app = getApp()
            app.setInviter(options.inviter)
        }
        // 处理场景值（如扫码进入）
        if (options.scene) {
            const scene = decodeURIComponent(options.scene)
            console.log('扫码场景参数:', scene)
        }

        this._loadPageData()
    },

    onShow: function () {
        // 每次显示刷新裂变活动数据（可能有变化）
    },

    onPullDownRefresh: function () {
        this._loadPageData().then(() => {
            wx.stopPullDownRefresh()
        })
    },

    // 分享给朋友
    onShareAppMessage: function () {
        const app = getApp()
        const openid = app.globalData.openid || ''
        return {
            title: config.shareTitle,
            path: `/pages/index/index?inviter=${openid}`,
            imageUrl: config.shareImageUrl || ''
        }
    },

    // 分享到朋友圈
    onShareTimeline: function () {
        const app = getApp()
        const openid = app.globalData.openid || ''
        return {
            title: config.shareTitle,
            query: `inviter=${openid}`,
            imageUrl: config.shareImageUrl || ''
        }
    },

    // 加载页面所有数据
    _loadPageData: async function () {
        this.setData({ loading: true })

        try {
            // 并行加载门店信息、裂变活动、推荐商品
            const homeContent = await this._loadHomeContent()
            const storeInfo = homeContent.storeInfo || await this._loadStoreInfo()

            // 推拿师信息：优先从门店数据获取，否则使用默认
            const therapist = (storeInfo && storeInfo.therapist) || {
                name: '李老师',
                title: '高级调理师',
                certTitle: '首席调理师',
                photo: '/assets/therapist.png',
                experience: '8年',
                serviceCount: '3000+',
                rating: '99%',
                bio: '毕业于中医药大学，专注小儿推拿领域。擅长运用传统中医手法结合现代理疗技术，为宝宝提供温和有效的调理方案。',
                specialties: ['小儿推拿', '脾胃调理', '体质辨识', '生长发育']
            }

            this.setData({
                storeInfo: storeInfo,
                banners: (storeInfo && storeInfo.banners) || [],
                fissionCampaigns: homeContent.fissionCampaigns || [],
                hotProducts: homeContent.hotProducts || [],
                hotPackages: homeContent.hotPackages || [],
                lotteryCampaign: homeContent.lotteryCampaign || null,
                therapist: therapist,
                loading: false
            })
        } catch (err) {
            console.error('加载首页数据失败:', err)
            this.setData({ loading: false })
        }
    },

    _loadHomeContent: async function () {
        try {
            const data = await callCloud('contentApi', { action: 'getHomeContent' })
            const products = (data.featuredProducts || []).map(item => ({
                ...item,
                priceYuan: (item.price / 100).toFixed(1),
                originalPriceYuan: item.originalPrice ? (item.originalPrice / 100).toFixed(1) : '',
                efficacy: item.efficacy || ''
            }))
            const campaigns = (data.fissionCampaigns || []).map(item => ({
                ...item,
                activityPriceYuan: (item.activityPrice / 100).toFixed(1),
                cashbackAmountYuan: (item.cashbackAmount / 100).toFixed(1),
                soldPercent: item.totalStock > 0
                    ? Math.min(Math.round(item.soldCount / item.totalStock * 100), 100)
                    : 0
            }))

            return {
                storeInfo: data.storeInfo || null,
                fissionCampaigns: campaigns,
                hotProducts: products.filter(i => i.type === 'physical' || i.type === 'service'),
                hotPackages: products.filter(i => i.type === 'package'),
                lotteryCampaign: (data.lotteryCampaigns || [])[0] || null
            }
        } catch (err) {
            console.error('加载首页聚合数据失败:', err)
            return {
                storeInfo: null,
                fissionCampaigns: [],
                hotProducts: [],
                hotPackages: [],
                lotteryCampaign: null
            }
        }
    },

    // 加载门店信息
    _loadStoreInfo: async function () {
        const app = getApp()
        try {
            const info = await app.getStoreInfo()
            return info
        } catch (err) {
            console.error('加载门店信息失败:', err)
            return null
        }
    },

    // ---- 页面导航 ----

    goToTongue: function () {
        wx.switchTab({ url: '/pages/tongue/tongue' })
    },

    goToMall: function () {
        wx.switchTab({ url: '/pages/mall/mall' })
    },

    goToFission: function () {
        wx.navigateTo({ url: '/pages/fission/fission' })
    },

    goToPackage: function () {
        wx.navigateTo({ url: '/pages/package-usage/package-usage' })
    },

    goToProduct: function (e) {
        const id = e.currentTarget.dataset.id
        wx.navigateTo({ url: `/pages/product-detail/product-detail?id=${id}` })
    },

    // 幸运大抽奖
    goToLottery: function () {
        wx.navigateTo({ url: '/pages/lottery/lottery' })
    },

    // 打开地图导航
    openLocation: function () {
        const store = this.data.storeInfo
        if (store && store.latitude && store.longitude) {
            wx.openLocation({
                latitude: store.latitude,
                longitude: store.longitude,
                name: store.name,
                address: store.address,
                scale: 18
            })
        }
    },

    // 拨打电话
    makeCall: function () {
        const store = this.data.storeInfo
        if (store && store.phone) {
            wx.makePhoneCall({
                phoneNumber: store.phone
            })
        }
    }
})
