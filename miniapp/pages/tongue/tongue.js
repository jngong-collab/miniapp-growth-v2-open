// pages/tongue/tongue.js
const config = require('../../config')
const { callCloud, callCloudWithLogin } = require('../../utils/cloud-api')

Page({
    data: {
        isLoggedIn: false,
        showLoginModal: false,
        loggingIn: false,
        privacyChecked: false,
        needPrivacyAuthorization: false,
        privacyContractName: '《用户隐私保护指引》',
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
        this._syncLoginState()
        if (this.data.isLoggedIn) {
            this._loadHistory()
        }
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

    onShow: async function () {
        await this._syncReviewConfig()
        this._syncLoginState()
        // 从报告页返回时，重置状态
        if (this._analysisCompleted) {
            this._analysisCompleted = false
            this.setData({ state: 'idle', selectedImage: '' })
            if (this.data.isLoggedIn) {
                this._loadHistory()
            }
        }
        if (!this.data.isLoggedIn) {
            await this._refreshPrivacyState()
            this._promptLoginForGuest()
        }
    },

    onHide: function () {
        this._guestPromptShown = false
        this.setData({ showLoginModal: false, loggingIn: false })
    },

    onUnload: function () {
        if (this._stepTimer) clearTimeout(this._stepTimer)
        if (this._navigateTimer) clearTimeout(this._navigateTimer)
    },

    _syncLoginState: function () {
        const app = getApp()
        const isLoggedIn = app.isCustomerLoggedIn ? app.isCustomerLoggedIn() : false
        this.setData({ isLoggedIn })
        if (!isLoggedIn) {
            this.setData({
                showLoginModal: this.data.showLoginModal && !isLoggedIn,
                state: 'idle',
                selectedImage: '',
                uploadedFileId: '',
                historyCount: 0,
                historyText: this._buildHistoryText(0, false)
            })
            return
        }
        this._guestPromptShown = false
    },

    _refreshPrivacyState: async function () {
        const app = getApp()
        if (!app || typeof app.getPrivacyAuthorizationState !== 'function') {
            this.setData({
                privacyChecked: true,
                needPrivacyAuthorization: false,
                privacyContractName: '《用户隐私保护指引》'
            })
            return
        }

        const privacyState = await app.getPrivacyAuthorizationState()
        this.setData({
            privacyChecked: true,
            needPrivacyAuthorization: !!privacyState.needAuthorization,
            privacyContractName: privacyState.privacyContractName || '《用户隐私保护指引》'
        })
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
            historyText: this._buildHistoryText(this.data.historyCount, this.data.isLoggedIn, historyLabel, emptyLabel),
            primaryActionText: isReviewMode ? reviewConfig.previewPrimaryText : '开始 AI 分析',
            analyzingTitle: isReviewMode ? reviewConfig.analyzingTitle : '正在深度解析舌象特征',
            analyzingSubtitle: isReviewMode ? reviewConfig.analyzingSubtitle : '结合中医体质理论进行推演…'
        })

        wx.setNavigationBarTitle({
            title: isReviewMode ? (reviewConfig.pageTitle || reviewConfig.entryTitle || '健康打卡') : 'AI看舌象'
        })
    },

    _buildHistoryText: function (historyCount, isLoggedIn, historyLabel, emptyLabel) {
        const safeHistoryLabel = historyLabel || (this.data.isReviewMode ? this.data.reviewConfig.historyLinkText : '查看历史报告')
        const safeEmptyLabel = emptyLabel || (this.data.isReviewMode ? this.data.reviewConfig.historyEmptyText : '暂无历史报告')
        if (!isLoggedIn) {
            return this.data.isReviewMode ? '登录后查看照片记录' : '登录后查看历史报告'
        }
        return historyCount > 0 ? `${safeHistoryLabel} (${historyCount})` : safeEmptyLabel
    },

    _promptLoginForGuest: function (force = false) {
        if (this.data.isLoggedIn) {
            return true
        }
        if (this._guestPromptShown && !force) {
            return false
        }
        this._guestPromptShown = true
        const app = getApp()
        if (app && typeof app.setPendingProtectedTarget === 'function') {
            app.setPendingProtectedTarget('/pages/tongue/tongue')
        }
        this.setData({
            showLoginModal: true
        })
        return false
    },

    _ensureCustomerLogin: function () {
        if (this.data.isLoggedIn) {
            return true
        }
        return this._promptLoginForGuest(true)
    },

    closeLoginModal: function () {
        this.setData({ showLoginModal: false })
    },

    openPrivacyContract: async function () {
        const app = getApp()
        if (!app || typeof app.openPrivacyContract !== 'function') {
            wx.showToast({ title: '当前版本暂不支持查看隐私指引', icon: 'none' })
            return
        }

        try {
            await app.openPrivacyContract()
        } catch (error) {
            wx.showToast({ title: '打开隐私指引失败', icon: 'none' })
        }
    },

    onAgreePrivacyAuthorization: function () {
        this.setData({
            privacyChecked: true,
            needPrivacyAuthorization: false
        })
        wx.showToast({ title: '已同意隐私指引', icon: 'success' })
    },

    onGetPhoneNumber: async function (e) {
        if (!this.data.privacyChecked) {
            await this._refreshPrivacyState().catch(() => {})
        }
        if (this.data.needPrivacyAuthorization) {
            wx.showToast({ title: '请先阅读并同意隐私指引', icon: 'none' })
            return
        }
        if (e.detail.errMsg && e.detail.errMsg.includes('fail')) {
            wx.showToast({ title: '授权失败', icon: 'none' })
            return
        }
        if (!e.detail.code) {
            wx.showToast({ title: '未获取到授权码', icon: 'none' })
            return
        }

        try {
            this.setData({ loggingIn: true })
            const res = await callCloud('opsApi', {
                action: 'bindPhoneNumber',
                code: e.detail.code
            })
            const phone = res?.phone || ''
            const sessionToken = res?.sessionToken || ''
            const expiresAt = res?.expiresAt || ''
            const user = res?.user || {}
            const app = getApp()
            if (!phone || !sessionToken) {
                wx.showToast({ title: '绑定失败', icon: 'none' })
                return
            }
            if (app.setCustomerLoginSuccess) {
                app.setCustomerLoginSuccess({
                    phone,
                    sessionToken,
                    expiresAt,
                    user
                })
            }
            this._syncLoginState()
            this.setData({
                showLoginModal: false,
                loggingIn: false,
                privacyChecked: true,
                needPrivacyAuthorization: false
            })
            await this._loadHistory()
            wx.showToast({ title: '登录成功', icon: 'success' })
            const target = app.consumePendingProtectedTarget ? app.consumePendingProtectedTarget() : ''
            if (target && target !== '/pages/tongue/tongue' && typeof app._navigateToPageOrTab === 'function') {
                app._navigateToPageOrTab(target)
            }
        } catch (error) {
            this.setData({ loggingIn: false })
            wx.showToast({ title: error.message || '绑定失败', icon: 'none' })
        }
    },

    // 加载历史记录数量
    _loadHistory: async function () {
        try {
            const history = await callCloudWithLogin('growthApi', { action: 'getTongueHistory' })
            const historyCount = history.length
            const historyText = this._buildHistoryText(historyCount, true)
            this.setData({ historyCount, historyText })
        } catch (e) { /* ignore */ }
    },

    // 选择/拍摄图片
    chooseImage: function () {
        if (!this._ensureCustomerLogin()) {
            return
        }
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
        if (!this._ensureCustomerLogin()) {
            return
        }
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
            this._stepTimer = setTimeout(() => { if (this.data.state === 'analyzing') this.setData({ step: 3 }) }, 3000)

            // 整理症状
            let finalSymptoms = []
            if (this.data.otherSymptom.trim()) {
                finalSymptoms.push(this.data.otherSymptom.trim())
            }

            // 步骤 4：生成建议（调云函数）
            const analyzeRes = await callCloudWithLogin('growthApi', {
                action: 'analyzeTongue',
                imageFileId: fileId,
                babyAge: this.data.ageIndex >= 0 ? this.data.ageList[this.data.ageIndex] : '',
                babyGender: this.data.babyGender,
                symptoms: finalSymptoms
            })

            this.setData({ step: 4 })

            const reportId = analyzeRes.reportId
            this._analysisCompleted = true
            this._navigateTimer = setTimeout(() => {
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
        if (!this._ensureCustomerLogin()) {
            return
        }
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
