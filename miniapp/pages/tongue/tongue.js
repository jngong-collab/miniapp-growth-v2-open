// pages/tongue/tongue.js
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
        otherSymptom: ''
    },

    onLoad: function () {
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
    },

    // 加载历史记录数量
    _loadHistory: async function () {
        try {
            const history = await callCloud('growthApi', { action: 'getTongueHistory' })
            this.setData({ historyCount: history.length })
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

    // 开始分析
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

            // 步骤 2：通知 AI 识别
            this.setData({ step: 2 })

            // 步骤 3：综合分析（模拟进度）
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
        return {
            title: '🔮 AI 看舌象，免费测体质！',
            path: '/pages/tongue/tongue'
        }
    }
})
