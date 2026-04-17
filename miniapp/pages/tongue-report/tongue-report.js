// pages/tongue-report/tongue-report.js
const config = require('../../config')
const { callCloud } = require('../../utils/cloud-api')

Page({
    data: {
        mode: 'report',     // 'report' | 'history'
        report: null,
        constitutionLabel: '',
        historyList: [],
        loading: true,
        reviewConfig: config.reviewModeFallback || {},
        isReviewMode: true,
        reportTitle: '照片记录',
        historyTitle: '照片记录',
        historySubtitle: 'History',
        detailShareTitle: '记录宝宝健康每一天',
        canReanalyze: false,
        isReanalyzing: false,
        safeReportView: true
    },

    onLoad: async function (options) {
        await this._syncReviewConfig()
        const mode = options.mode || 'report'
        this.setData({ mode })

        if (mode === 'history') {
            wx.setNavigationBarTitle({
                title: this.data.reviewConfig.historyTitle || '照片记录'
            })
        }

        if (mode === 'history') {
            this._loadHistory()
        } else if (options.reportId) {
            this._loadReport(options.reportId)
        }
    },

    onShow: function () {
        this._syncReviewConfig()
    },

    _syncReviewConfig: async function () {
        const app = getApp()
        if (app.loadReviewConfig) {
            await app.loadReviewConfig().catch(() => {})
        }
        const reviewConfig = app.getReviewConfig ? app.getReviewConfig() : (config.reviewModeFallback || {})
        const isReviewMode = reviewConfig.enabled !== false
        this.setData({
            reviewConfig,
            isReviewMode,
            reportTitle: isReviewMode ? (reviewConfig.reportTitle || '照片记录') : '舌象分析报告',
            historyTitle: isReviewMode ? (reviewConfig.historyTitle || '照片记录') : '分析记录',
            historySubtitle: isReviewMode ? 'Photo History' : 'History',
            detailShareTitle: reviewConfig.shareTitle || config.shareTitle
        })

        if (this.data.mode === 'history') {
            wx.setNavigationBarTitle({
                title: isReviewMode ? (reviewConfig.historyTitle || '照片记录') : '分析记录'
            })
        }
    },

    _isPendingReviewRecord: function (item) {
        return Boolean(item && item.isReviewMode && !item.result)
    },

    _canShowSafeReportView: function (report) {
        if (!report) return false
        if (this.data.isReviewMode) return true
        return this._isPendingReviewRecord(report)
    },

    _canReanalyzeReport: function (report) {
        if (!report) return false
        return !this.data.isReviewMode
            && this.data.reviewConfig.allowReanalyzeAfterReview !== false
            && this._isPendingReviewRecord(report)
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
            const safeReportView = this._canShowSafeReportView(report)
            const constitutionLabel = safeReportView
                ? (this.data.reviewConfig.reportTitle || '照片记录')
                : (report.result?.conclusion || '综合分析')
            const createdAtStr = this._formatDate(report.createdAt)

            const recs = report.result?.product_recommendations || []
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

            const canReanalyze = this._canReanalyzeReport(report)
            this.setData({ report, constitutionLabel, createdAtStr, recommendGroups, safeReportView, canReanalyze })
            wx.setNavigationBarTitle({
                title: safeReportView
                    ? (this.data.reviewConfig.reportTitle || '照片记录')
                    : '舌象分析报告'
            })
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
                createdAtStr: this._formatDate(item.createdAt),
                isPendingReanalyze: this._isPendingReviewRecord(item)
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
        if (this.data.isReviewMode) {
            wx.switchTab({ url: '/pages/tongue/tongue' })
            return
        }
        wx.navigateBack()
    },

    // 去拍摄
    goAnalyze: function () {
        wx.switchTab({ url: '/pages/tongue/tongue' })
    },

    reanalyzeReport: function () {
        const report = this.data.report
        if (!this._canReanalyzeReport(report) || this.data.isReanalyzing) return

        wx.showModal({
            title: '确认生成 AI 报告',
            content: this.data.reviewConfig.detailCtaText || '消耗 1 积分，立即生成 AI 体质报告',
            confirmText: '立即生成',
            success: async (res) => {
                if (!res.confirm) return

                this.setData({ isReanalyzing: true })
                try {
                    const result = await callCloud('growthApi', {
                        action: 'reanalyzeTongueReport',
                        reportId: report._id
                    })
                    const nextReportId = result && result.reportId ? result.reportId : report._id
                    wx.showToast({ title: 'AI 报告生成中', icon: 'none' })
                    this._loadReport(nextReportId)
                } catch (error) {
                    wx.showToast({ title: error.message || '暂时无法生成报告', icon: 'none' })
                } finally {
                    this.setData({ isReanalyzing: false })
                }
            }
        })
    },

    // 分享报告
    onShareAppMessage: function () {
        const report = this.data.report
        const app = getApp()
        const shareConfig = app.getShareConfig ? app.getShareConfig() : {
            title: this.data.detailShareTitle || config.shareTitle,
            imageUrl: this.data.reviewConfig.safeShareImageUrl || ''
        }
        const safeTitle = this.data.reviewConfig.shareTitle || this.data.detailShareTitle || config.shareTitle
        return {
            title: this.data.safeReportView
                ? safeTitle
                : `🔮 ${this.data.constitutionLabel}，快来看看你的体质！`,
            path: '/pages/tongue/tongue',
            imageUrl: this.data.safeReportView
                ? (shareConfig.imageUrl || '')
                : (report?.imageFileId || '')
        }
    }
})
