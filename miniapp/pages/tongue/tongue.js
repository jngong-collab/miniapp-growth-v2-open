// pages/tongue/tongue.js
const config = require('../../config')
const { callCloud } = require('../../utils/cloud-api')

Page({
    data: {
        state: 'idle',    // 'idle' | 'preview' | 'analyzing'
        selectedImage: '',
        uploadedFileId: '',
        step: 0,
        dailyQuota: -1,
        historyCount: 0,
        ageList: ['0-1岁', '1岁', '2岁', '3岁', '4岁', '5岁', '6岁', '7岁', '8岁', '9岁', '10岁', '11岁', '12岁及以上'],
        ageIndex: -1,
        babyGender: '',
        otherSymptom: '',
        reviewConfig: config.reviewModeFallback || {},
        isReviewMode: true,
        stepLabels: ['填写信息', '拍摄照片', '保存记录'],
        historyText: '暂无照片记录',
        primaryActionText: '保存本次记录',
        analyzingTitle: '正在保存照片记录',
        analyzingSubtitle: '请稍候，正在整理本次拍摄内容…'
    },

    onLoad: async function () {
        await this._syncReviewConfig()
        this._loadHistory()
        // 读取上次保存的宝宝信息
        const savedAge = wx.getStorageSync('tongue_baby_age_index')
        const savedGender = wx.getStorageSync('tongue_baby_gender')
        if (savedAge !== '' && savedAge !== undefined) {
            this.setData({ ageIndex: Number(savedAge) })
        }
        if (savedGender) {
            this.setData({ babyGender: savedGender })
        }
    },

    onShow: function () {
        // 从报告页返回时，重置状态
        if (this._analysisCompleted) {
            this._analysisCompleted = false
            this.setData({ state: 'idle', selectedImage: '' })
            this._loadHistory()
        }
        this._syncReviewConfig()
    },

    _syncReviewConfig: async function () {
        const app = getApp()
        if (app.loadReviewConfig) {
            await app.loadReviewConfig().catch(() => {})
        }
        const reviewConfig = app.getReviewConfig ? app.getReviewConfig() : (config.reviewModeFallback || {})
        const isReviewMode = reviewConfig.enabled !== false
        const stepLabels = isReviewMode
            ? ['填写信息', '拍摄照片', '保存记录']
            : ['填写信息', '拍摄舌象', '获取报告']
        const historyLabel = isReviewMode ? reviewConfig.historyLinkText : '查看历史报告'
        const emptyLabel = isReviewMode ? reviewConfig.historyEmptyText : '暂无历史报告'

        this.setData({
            reviewConfig,
            isReviewMode,
            stepLabels,
            historyText: this.data.historyCount > 0
                ? `${historyLabel} (${this.data.historyCount})`
                : emptyLabel,
            primaryActionText: isReviewMode ? reviewConfig.previewPrimaryText : '开始 AI 分析',
            analyzingTitle: isReviewMode ? reviewConfig.analyzingTitle : '正在深度解析舌象特征',
            analyzingSubtitle: isReviewMode ? reviewConfig.analyzingSubtitle : '结合中医体质理论进行推演…'
        })

        wx.setNavigationBarTitle({
            title: isReviewMode ? (reviewConfig.pageTitle || reviewConfig.entryTitle || '健康打卡') : 'AI看舌象'
        })
    },

    // 加载历史记录数量
    _loadHistory: async function () {
        try {
            const history = await callCloud('growthApi', { action: 'getTongueHistory' })
            const historyCount = history.length
            const historyText = historyCount > 0
                ? `${this.data.isReviewMode ? this.data.reviewConfig.historyLinkText : '查看历史报告'} (${historyCount})`
                : (this.data.isReviewMode ? this.data.reviewConfig.historyEmptyText : '暂无历史报告')
            this.setData({ historyCount, historyText })
        } catch (e) { /* ignore */ }
    },

    // 选择/拍摄图片
    chooseImage: function () {
        wx.chooseMedia({
            count: 1,
            mediaType: ['image'],
            sourceType: ['album', 'camera'],
            camera: 'back',
            success: res => {
                const tempFilePath = res.tempFiles[0].tempFilePath
                // 压缩图片
                wx.compressImage({
                    src: tempFilePath,
                    quality: 70,
                    success: compressRes => {
                        this.setData({ selectedImage: compressRes.tempFilePath, state: 'preview' })
                    },
                    fail: () => {
                        this.setData({ selectedImage: tempFilePath, state: 'preview' })
                    }
                })
            }
        })
    },

    // 重新拍摄
    retakePhoto: function () {
        this.setData({ state: 'idle', selectedImage: '' })
    },

    // 表单事件
    onAgeChange: function (e) {
        const idx = e.detail.value
        this.setData({ ageIndex: idx })
        wx.setStorageSync('tongue_baby_age_index', idx)
    },
    onGenderTap: function (e) {
        const gender = e.currentTarget.dataset.gender
        this.setData({ babyGender: gender })
        wx.setStorageSync('tongue_baby_gender', gender)
    },
    onOtherSymptomInput: function (e) {
        this.setData({ otherSymptom: e.detail.value })
    },

    // 开始分析 / 保存记录
    startAnalyze: async function () {
        this.setData({ state: 'analyzing', step: 0 })

        try {
            // 步骤 1：上传图片
            this.setData({ step: 1 })
            const uploadRes = await wx.cloud.uploadFile({
                cloudPath: `tongue/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`,
                filePath: this.data.selectedImage
            })
            const fileId = uploadRes.fileID

            // 步骤 2：提交通用后端处理（审核态将由后端降级为照片记录）
            this.setData({ step: 2 })

            // 步骤 3：模拟进度
            setTimeout(() => { if (this.data.state === 'analyzing') this.setData({ step: 3 }) }, 3000)

            // 整理症状
            let finalSymptoms = []
            if (this.data.otherSymptom.trim()) {
                finalSymptoms.push(this.data.otherSymptom.trim())
            }

            // 步骤 4：生成建议（调云函数）
            const analyzeRes = await callCloud('growthApi', {
                action: 'analyzeTongue',
                imageFileId: fileId,
                babyAge: this.data.ageIndex >= 0 ? this.data.ageList[this.data.ageIndex] : '',
                babyGender: this.data.babyGender,
                symptoms: finalSymptoms
            })

            this.setData({ step: 4 })

            const reportId = analyzeRes.reportId
            this._analysisCompleted = true
            setTimeout(() => {
                wx.navigateTo({
                    url: `/pages/tongue-report/tongue-report?reportId=${reportId}`
                })
            }, 500)
        } catch (err) {
            console.error('分析失败:', err)
            const errMsg = (err.message || err.errMsg || '').toLowerCase()
            if (errMsg.includes('timed out') || errMsg.includes('time_limit')) {
                this._handleError('当前访问人数较多，请稍后再试')
            } else {
                this._handleError('网络异常，请重试')
            }
        }
    },

    _handleError: function (msg) {
        this.setData({ state: 'preview' })
        wx.showToast({ title: msg, icon: 'none', duration: 3000 })
    },

    // 去历史记录页
    goToHistory: function () {
        wx.navigateTo({ url: '/pages/tongue-report/tongue-report?mode=history' })
    },

    // 分享
    onShareAppMessage: function () {
        const app = getApp()
        const shareConfig = app.getShareConfig ? app.getShareConfig() : {
            title: this.data.reviewConfig.shareTitle || config.shareTitle,
            imageUrl: this.data.reviewConfig.safeShareImageUrl || ''
        }
        return {
            title: shareConfig.title || this.data.reviewConfig.shareTitle || config.shareTitle,
            path: '/pages/tongue/tongue',
            imageUrl: shareConfig.imageUrl || ''
        }
    }
})
