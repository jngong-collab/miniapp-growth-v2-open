// pages/profile/profile.js
const config = require('../../config')
const { countActivePackageItems } = require('../../utils/package-state')
const { isWorkbenchUser, hasWorkbenchPermission } = require('../../utils/workbench')
const { callCloud, callCloudWithLogin } = require('../../utils/cloud-api')

function getGuestData() {
    return {
        isLoggedIn: false,
        userInfo: {},
        privacyChecked: false,
        needPrivacyAuthorization: false,
        privacyContractName: '《用户隐私保护指引》',
        loggingIn: false,
        balanceYuan: '0.0',
        levelLabel: '普通会员',
        orderCount: 0,
        pendingCount: 0,
        packageCount: 0,
        invitedCount: 0,
        tongueCount: 0,
        tongueCountLabel: ''
    }
}

Page({
    data: {
        ...getGuestData(),
        storePhone: '',
        storeInfo: null,
        version: config.version || '1.0.0',
        role: 'customer',
        permissions: [],
        canEnterWorkbench: false,
        reviewConfig: config.reviewModeFallback || {},
        isReviewMode: true,
        tongueMenuLabel: '照片记录',
        tongueCountLabel: ''
    },

    onLoad: function () {
    },

    onShow: async function () {
        await this._syncReviewConfig()
        await this._refreshSession()
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
        this.setData({
            reviewConfig,
            isReviewMode,
            tongueMenuLabel: isReviewMode ? (reviewConfig.historyTitle || '照片记录') : 'AI 舌象记录'
        })
    },

    _refreshSession: async function () {
        const app = getApp()
        const isLoggedIn = app.isCustomerLoggedIn ? app.isCustomerLoggedIn() : false
        const userInfo = app.globalData.userInfo || {}

        this.setData({
            ...(isLoggedIn ? {} : getGuestData()),
            isLoggedIn,
            userInfo: isLoggedIn ? userInfo : {},
            role: app.globalData.role || 'customer',
            permissions: app.globalData.permissions || [],
            canEnterWorkbench: isWorkbenchUser(app.globalData.role)
        })

        await Promise.all([
            isLoggedIn ? this._loadUserStats() : this._resetUserStats(),
            this._loadStoreInfo()
        ])

        if (isLoggedIn) {
            this.setData({
                privacyChecked: true,
                needPrivacyAuthorization: false,
                privacyContractName: '《用户隐私保护指引》',
                loggingIn: false
            })
            this._goAfterLogin()
            return
        }

        await this._refreshPrivacyState().catch(() => {
            this.setData({
                privacyChecked: true,
                needPrivacyAuthorization: false
            })
        })
    },

    _resetUserStats: function () {
        this.setData({
            balanceYuan: '0.0',
            invitedCount: 0,
            levelLabel: '普通会员',
            orderCount: 0,
            pendingCount: 0,
            packageCount: 0,
            tongueCount: 0,
            tongueCountLabel: ''
        })
    },

    _goAfterLogin: function () {
        const app = getApp()
        const target = app.consumePendingProtectedTarget ? app.consumePendingProtectedTarget() : ''
        if (!target) return
        if (target === '/pages/profile/profile') return
        if (app && typeof app._navigateToPageOrTab === 'function') {
            app._navigateToPageOrTab(target)
        }
    },

    _requireLogin: function (target) {
        const app = getApp()
        return app.requireCustomerLogin(target, {
            content: '请先绑定手机号后使用该功能'
        })
    },

    _loadUserStats: async function () {
        try {
            // 并发请求基础统计数据
            const [earningsRes, packagesRes, tongueRes, orderCounts] = await Promise.all([
                callCloudWithLogin('growthApi', { action: 'getMyEarnings' }).catch(() => ({})),
                callCloudWithLogin('growthApi', { action: 'getMyPackages' }).catch(() => []),
                callCloudWithLogin('growthApi', { action: 'getTongueHistory' }).catch(() => []),
                callCloudWithLogin('commerceApi', { action: 'getMyOrderCounts' }).catch(() => ({ all: 0, pending: 0, refund: 0 }))
            ])

            const earnings = earningsRes || {}
            const packages = packagesRes || []
            const tongues = tongueRes || []
            const counts = orderCounts || {}

            const levelMap = { vip: 'VIP 会员', svip: 'SVIP 会员', normal: '普通会员' }

            this.setData({
                balanceYuan: ((earnings.balance || 0) / 100).toFixed(1),
                invitedCount: earnings.totalInvited || 0,
                levelLabel: levelMap[earnings.memberLevel] || '普通会员',
                orderCount: counts.all || 0,
                pendingCount: counts.pending || 0,
                packageCount: countActivePackageItems(packages),
                tongueCount: tongues.length,
                tongueCountLabel: tongues.length
                    ? `${tongues.length} ${this.data.isReviewMode ? '条记录' : '次分析'}`
                    : ''
            })
        } catch (e) {
            console.error('加载统计失败:', e)
        }
    },

    _loadStoreInfo: async function () {
        const app = getApp()
        const store = await app.getStoreInfo()
        if (store) {
            this.setData({ storeInfo: store, storePhone: store.phone || '' })
        }
    },

    // 跳转订单
    goToOrders: function (e) {
        const status = e.currentTarget.dataset.status || 'all'
        if (!this._requireLogin(`/pages/orders/orders?status=${status}`)) {
            return
        }
        wx.navigateTo({ url: `/pages/orders/orders?status=${status}` })
    },

    // 跳转套餐
    goToPackage: function () {
        if (!this._requireLogin('/pages/package-usage/package-usage')) {
            return
        }
        wx.navigateTo({ url: '/pages/package-usage/package-usage' })
    },

    // 跳转裂变
    goToFission: function () {
        wx.navigateTo({ url: '/pages/fission/fission' })
    },

    // 跳转舌象历史
    goToTongue: function () {
        if (!this._requireLogin('/pages/tongue-report/tongue-report?mode=history')) {
            return
        }
        wx.navigateTo({ url: '/pages/tongue-report/tongue-report?mode=history' })
    },

    // 拨打电话
    callStore: function () {
        if (!this.data.storePhone) {
            wx.showToast({ title: '门店电话未设置', icon: 'none' })
            return
        }
        wx.makePhoneCall({ phoneNumber: this.data.storePhone })
    },

    // 打开地图
    openMap: function () {
        const store = this.data.storeInfo
        if (!store || !store.latitude) {
            wx.showToast({ title: '门店位置未设置', icon: 'none' })
            return
        }
        wx.openLocation({
            latitude: store.latitude,
            longitude: store.longitude,
            name: store.name,
            address: store.address
        })
    },

    // 员工/管理员功能
    goToVerify: function () {
        if (!this.canUsePermission('verify')) {
            wx.showToast({ title: '无权限访问核销', icon: 'none' })
            return
        }
        wx.navigateTo({ url: '/pages/workbench/verify/verify' })
    },

    goToStaffManage: function () {
        if (!this.canUsePermission('manageStaff')) {
            wx.showToast({ title: '无权限访问员工管理', icon: 'none' })
            return
        }
        wx.navigateTo({ url: '/pages/workbench/staff/staff' })
    },

    goToWorkbench: function () {
        if (!isWorkbenchUser(this.data.role)) {
            wx.showToast({ title: '暂无工作台权限', icon: 'none' })
            return
        }
        wx.navigateTo({ url: '/pages/workbench/dashboard/dashboard' })
    },

    canUsePermission: function (permission) {
        return hasWorkbenchPermission(this.data.permissions, permission)
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
                this.setData({ loggingIn: false })
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
            } else if (app.globalData && app.globalData.userInfo) {
                app.globalData.userInfo.phone = phone
                app.globalData.isLoggedIn = true
            }
            const nextUserInfo = app.globalData.userInfo || { ...user, phone }
            this.setData({
                isLoggedIn: true,
                userInfo: nextUserInfo,
                loggingIn: false,
                privacyChecked: true,
                needPrivacyAuthorization: false
            })

            wx.showToast({ title: '绑定成功', icon: 'success' })
            await this._loadUserStats().catch(() => {})
            this._goAfterLogin()
        } catch (err) {
            this.setData({ loggingIn: false })
            wx.showToast({ title: err.message || '绑定失败', icon: 'none' })
        }
    },

    doLogout: function () {
        wx.showModal({
            title: '确认退出登录',
            content: '退出后将清除当前手机号登录状态，重新进入可再次绑定手机号',
            success: async res => {
                if (!res.confirm) return
                const app = getApp()
                try {
                    await callCloud('opsApi', { action: 'logout' })
                } catch (error) {
                    console.warn('云端退出失败:', error)
                }
                if (app && app.clearCustomerAuth) {
                    app.clearCustomerAuth()
                } else if (app && app.logoutCustomer) {
                    app.logoutCustomer()
                }
                this.setData({
                    ...getGuestData(),
                    role: app.globalData.role || 'customer',
                    permissions: app.globalData.permissions || [],
                    canEnterWorkbench: isWorkbenchUser(app.globalData.role)
                })
                wx.showToast({ title: '已退出登录', icon: 'success', duration: 1500 })
            }
        })
    }
})
