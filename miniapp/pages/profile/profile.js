// pages/profile/profile.js
const config = require('../../config')
const { countActivePackageItems } = require('../../utils/package-state')
const { isWorkbenchUser, hasWorkbenchPermission } = require('../../utils/workbench')
const { callCloud } = require('../../utils/cloud-api')

Page({
    data: {
        userInfo: {},
        isLoggedIn: false,
        loginRedirect: '',
        balanceYuan: '0.0',
        levelLabel: '普通会员',
        orderCount: 0,
        pendingCount: 0,
        packageCount: 0,
        invitedCount: 0,
        tongueCount: 0,
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

    onLoad: function (options = {}) {
        const redirect = options.loginRedirect ? decodeURIComponent(options.loginRedirect) : ''
        if (redirect) {
            this.setData({ loginRedirect: redirect })
        }
    },

    onShow: async function () {
        await this._syncReviewConfig()
        await this._refreshSession()
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
            isLoggedIn,
            userInfo: isLoggedIn ? userInfo : { ...(userInfo || {}), phone: '' },
            role: app.globalData.role || 'customer',
            permissions: app.globalData.permissions || [],
            canEnterWorkbench: isWorkbenchUser(app.globalData.role)
        })

        await Promise.all([
            isLoggedIn ? this._loadUserStats() : this._resetUserStats(),
            this._loadStoreInfo()
        ])

        if (isLoggedIn) {
            this._goAfterLogin()
        }
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
        const target = this.data.loginRedirect
        if (!target) return
        if (target === '/pages/profile/profile') return
        this.setData({ loginRedirect: '' })
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
                callCloud('growthApi', { action: 'getMyEarnings' }).catch(() => ({})),
                callCloud('growthApi', { action: 'getMyPackages' }).catch(() => []),
                callCloud('growthApi', { action: 'getTongueHistory' }).catch(() => []),
                callCloud('commerceApi', { action: 'getMyOrderCounts' }).catch(() => ({ all: 0, pending: 0, refund: 0 }))
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

    onGetPhoneNumber: async function (e) {
        if (e.detail.errMsg && e.detail.errMsg.includes('fail')) {
            wx.showToast({ title: '授权失败', icon: 'none' })
            return
        }
        if (!e.detail.code) {
            wx.showToast({ title: '未获取到授权码', icon: 'none' })
            return
        }

        try {
            // callCloud 返回的是 result.data，此处 res 为 { phone: 'xxx' }
            const res = await callCloud('opsApi', {
                action: 'bindPhoneNumber',
                code: e.detail.code
            })
            const phone = res?.phone || ''
            const app = getApp()
            if (!phone) {
                wx.showToast({ title: '绑定失败', icon: 'none' })
                return
            }

            if (app.setCustomerLoginSuccess) {
                app.setCustomerLoginSuccess(phone)
            } else if (app.globalData && app.globalData.userInfo) {
                app.globalData.userInfo.phone = phone
                app.globalData.isLoggedIn = true
            }
            this.setData({
                isLoggedIn: true,
                'userInfo.phone': phone
            })

            wx.showToast({ title: '绑定成功', icon: 'success' })
            if (app && (typeof app.requireCustomerLogin === 'function' || typeof app.isCustomerLoggedIn === 'function')) {
                this._loadUserStats().catch(() => {})
            }
            this._goAfterLogin()
        } catch (err) {
            wx.showToast({ title: err.message || '绑定失败', icon: 'none' })
        }
    },

    doLogout: function () {
        wx.showModal({
            title: '确认退出登录',
            content: '退出后将清除当前手机号登录状态，重新进入可再次绑定手机号',
            success: res => {
                if (!res.confirm) return
                const app = getApp()
                if (app && app.logoutCustomer) {
                    app.logoutCustomer()
                }
                this._refreshSession()
                wx.showToast({ title: '已退出登录', icon: 'success', duration: 1500 })
            }
        })
    }
})
