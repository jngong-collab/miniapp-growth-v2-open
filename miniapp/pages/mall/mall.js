// pages/mall/mall.js
const { callCloud } = require('../../utils/cloud-api')

const MALL_CATEGORIES = ['五行泡浴', '百草元气灸', '靶向敷贴', '精油系列', '超值套餐']

Page({
    data: {
        categories: MALL_CATEGORIES,
        activeTab: MALL_CATEGORIES[0],
        keyword: '',
        products: [],
        campaignMap: {},  // productId -> campaign 映射
        fissionCampaigns: [], // 限时活动列表
        page: 1,
        pageSize: 10,
        hasMore: false,
        loading: false
    },

    onLoad: function () {
        this._productsRequestSeq = 0
        this._loadData()
    },

    onPullDownRefresh: async function () {
        await this._loadData(true)
        wx.stopPullDownRefresh()
    },

    // 切换分类
    switchTab: function (e) {
        const tab = e.currentTarget.dataset.tab
        if (tab === this.data.activeTab) return
        this.setData({ activeTab: tab, page: 1, hasMore: false })
        this._loadProducts(true)
    },

    // 搜索
    onSearch: function (e) {
        const keyword = e.detail.value || ''
        this.setData({ keyword, page: 1 })
        if (this._searchTimer) clearTimeout(this._searchTimer)
        this._searchTimer = setTimeout(() => this._loadProducts(true), 400)
    },

    // 加载所有数据
    _loadData: async function (reset = true) {
        // 并行加载活动和商品
        await Promise.all([
            this._loadCampaigns(),
            this._loadProducts(reset)
        ])
        // 加载完成后，用产品数据回填活动的图片
        this._enrichCampaignImages()
    },

    // 用已加载的产品图片回填活动
    _enrichCampaignImages: function () {
        const campaigns = this.data.fissionCampaigns
        const products = this.data.products
        if (!campaigns.length || !products.length) return

        let changed = false
        const updated = campaigns.map(c => {
            if (!c.productImage) {
                const prod = products.find(p => p._id === c.productId)
                if (prod && prod.images && prod.images[0]) {
                    changed = true
                    return { ...c, productImage: prod.images[0] }
                }
            }
            return c
        })
        if (changed) {
            this.setData({ fissionCampaigns: updated })
        }
    },

    // 加载所有裂变活动，建立 productId → campaign 映射
    _loadCampaigns: async function () {
        try {
            const data = await callCloud('contentApi', { action: 'getMallContent', page: 1, pageSize: 1 })
            if (data.fissionCampaigns?.length > 0) {
                const map = {}
                const list = []
                data.fissionCampaigns.forEach(c => {
                    const obj = {
                        ...c,
                        activityPriceYuan: (c.activityPrice / 100).toFixed(1),
                        cashbackAmountYuan: (c.cashbackAmount / 100).toFixed(1),
                        soldPercent: c.totalStock > 0 ? Math.min(Math.round(c.soldCount / c.totalStock * 100), 100) : 0
                    }
                    map[c.productId] = obj
                    list.push(obj)
                })
                this.setData({ campaignMap: map, fissionCampaigns: list })
            }
        } catch (e) { /* ignore */ }
    },

    // 加载商品列表
    _loadProducts: async function (reset = false) {
        if (this.data.loading && !reset) return
        const requestId = ++this._productsRequestSeq
        const page = reset ? 1 : this.data.page
        const category = this.data.activeTab
        const trimmedKeyword = (this.data.keyword || '').trim()
        const effectiveKeyword = trimmedKeyword.length >= 2 ? trimmedKeyword : ''

        this.setData({ loading: true })
        try {
            const data = await callCloud('contentApi', {
                action: 'getMallContent',
                category,
                page,
                pageSize: this.data.pageSize,
                keyword: effectiveKeyword
            })
            if (requestId !== this._productsRequestSeq) return
            if (data) {
                const campaignMap = this.data.campaignMap
                const mergedCampaignMap = { ...campaignMap }
                ;(data.fissionCampaigns || []).forEach(c => {
                    mergedCampaignMap[c.productId] = {
                        ...c,
                        activityPriceYuan: (c.activityPrice / 100).toFixed(1),
                        cashbackAmountYuan: (c.cashbackAmount / 100).toFixed(1),
                        soldPercent: c.totalStock > 0 ? Math.min(Math.round(c.soldCount / c.totalStock * 100), 100) : 0
                    }
                })

                const newProducts = (data.products || []).map(p => {
                    const campaign = mergedCampaignMap[p._id]
                    return {
                        ...p,
                        priceYuan: (p.price / 100).toFixed(1),
                        originalPriceYuan: p.originalPrice > 0 ? (p.originalPrice / 100).toFixed(1) : '',
                        hasCashback: !!campaign,
                        cashbackAmountYuan: campaign ? campaign.cashbackAmountYuan : ''
                    }
                })
                const products = reset ? newProducts : this.data.products.concat(newProducts)
                this.setData({
                    campaignMap: mergedCampaignMap,
                    products,
                    page: page + 1,
                    hasMore: newProducts.length >= this.data.pageSize
                })
            }
        } catch (e) {
            wx.showToast({ title: '加载失败', icon: 'none' })
        } finally {
            if (requestId === this._productsRequestSeq) {
                this.setData({ loading: false })
            }
        }
    },

    // 加载更多
    loadMore: function () {
        if (this.data.loading || !this.data.hasMore) return
        this._loadProducts(false)
    },

    // 跳转商品详情
    goToProduct: function (e) {
        const id = e.currentTarget.dataset.id
        wx.navigateTo({ url: `/pages/product-detail/product-detail?id=${id}` })
    },

    // 跳转裂变活动
    goToFission: function () {
        wx.navigateTo({ url: '/pages/fission/fission' })
    }
})

