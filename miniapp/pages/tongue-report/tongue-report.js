// pages/tongue-report/tongue-report.js
const { callCloud } = require('../../utils/cloud-api')

Page({
    data: {
        mode: 'report',     // 'report' | 'history'
        report: null,
        constitutionLabel: '',
        historyList: [],
        loading: true
    },

    onLoad: function (options) {
        const mode = options.mode || 'report'
        this.setData({ mode })

        if (mode === 'history') {
            this._loadHistory()
        } else if (options.reportId) {
            this._loadReport(options.reportId)
        }
    },

    // 加载单个报告
    _loadReport: async function (reportId) {
        this.setData({ loading: true })
        try {
            const report = await callCloud('growthApi', {
                action: 'getTongueReport',
                reportId
            })

            if (report.result) {
                if (!report.result.features) report.result.features = {}
                if (!report.result.product_recommendations) report.result.product_recommendations = []
                if (!report.result.suggestions) report.result.suggestions = []
            }
            const constitutionLabel = report.result?.conclusion || '综合分析'
            const createdAtStr = this._formatDate(report.createdAt)

            const recs = report.result.product_recommendations || []
            const groupMap = {}
            recs.forEach(r => {
                const cat = r.category || '泡浴推荐'
                if (!groupMap[cat]) groupMap[cat] = []
                groupMap[cat].push(r)
            })
            const recommendGroups = Object.keys(groupMap).map(cat => ({
                category: cat,
                items: groupMap[cat]
            }))

            this.setData({ report, constitutionLabel, createdAtStr, recommendGroups })
        } catch (e) {
            wx.showToast({ title: e.message || '网络异常', icon: 'none' })
        } finally {
            this.setData({ loading: false })
        }
    },

    // 加载历史列表
    _loadHistory: async function () {
        this.setData({ loading: true })
        try {
            const history = await callCloud('growthApi', { action: 'getTongueHistory' })
            const list = history.map(item => ({
                ...item,
                createdAtStr: this._formatDate(item.createdAt)
            }))
            this.setData({ historyList: list })
        } catch (e) {
            wx.showToast({ title: e.message || '加载失败', icon: 'none' })
        } finally {
            this.setData({ loading: false })
        }
    },

    // 格式化日期
    _formatDate: function (date) {
        if (!date) return ''
        const d = new Date(date)
        if (isNaN(d.getTime())) return ''
        return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    },

    // 查看历史报告
    viewHistoryReport: function (e) {
        const id = e.currentTarget.dataset.id
        wx.navigateTo({ url: `/pages/tongue-report/tongue-report?reportId=${id}` })
    },

    // 跳转商品详情
    goToProduct: function (e) {
        const id = e.currentTarget.dataset.id
        if (!id) {
            wx.showToast({ title: '产品暂未上架', icon: 'none' })
            return
        }
        wx.navigateTo({ url: `/pages/product-detail/product-detail?id=${id}` })
    },


    // 再次分析
    goAnalyzeAgain: function () {
        wx.navigateBack()
    },

    // 去拍摄
    goAnalyze: function () {
        wx.switchTab({ url: '/pages/tongue/tongue' })
    },

    // 分享报告
    onShareAppMessage: function () {
        const report = this.data.report
        return {
            title: `🔮 ${this.data.constitutionLabel}，快来看看你的体质！`,
            path: '/pages/tongue/tongue',
            imageUrl: report?.imageFileId || ''
        }
    }
})
