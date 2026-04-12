// pages/profile/profile.js
const config = require('../../config')
const { countActivePackageItems } = require('../../utils/package-state')
const { isWorkbenchUser, hasWorkbenchPermission } = require('../../utils/workbench')
const { callCloud } = require('../../utils/cloud-api')

Page({
    data: {
        userInfo: {},
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
        canEnterWorkbench: false
    },

    onLoad: function () { /* 首次由 onShow 触发 */ },
    onShow: function () { this._loadAll() },

    _loadAll: async function () {
        const app = getApp()
        const userInfo = app.globalData.userInfo || {}
        this.setData({
            userInfo,
            role: app.globalData.role || 'customer',
            permissions: app.globalData.permissions || [],
            canEnterWorkbench: isWorkbenchUser(app.globalData.role)
        })

        await Promise.all([
            this._loadUserStats(),
            this._loadStoreInfo()
        ])
    },

    _loadUserStats: async function () {
        try {
            // 并发请求基础统计数据
            const [earningsRes, packagesRes, tongueRes, pendingOrdersRes, allOrders] = await Promise.all([
                callCloud('growthApi', { action: 'getMyEarnings' }).catch(() => ({})),
                callCloud('growthApi', { action: 'getMyPackages' }).catch(() => []),
                callCloud('growthApi', { action: 'getTongueHistory' }).catch(() => []),
                callCloud('commerceApi', { action: 'getMyOrders', status: 'pending' }).catch(() => []),
                callCloud('commerceApi', { action: 'getMyOrders', status: 'all' }).catch(() => [])
            ])

            const earnings = earningsRes || {}
            const packages = packagesRes || []
            const tongues = tongueRes || []
            const pendingOrders = pendingOrdersRes || []

            const levelMap = { vip: 'VIP 会员', svip: 'SVIP 会员', normal: '普通会员' }

            this.setData({
                balanceYuan: ((earnings.balance || 0) / 100).toFixed(1),
                invitedCount: earnings.totalInvited || 0,
                levelLabel: levelMap[earnings.memberLevel] || '普通会员',
                orderCount: allOrders.length,
                pendingCount: pendingOrders.length,
                packageCount: countActivePackageItems(packages),
                tongueCount: tongues.length
            })
        } catch (e) { console.error('加载统计失败:', e) }
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
        wx.navigateTo({ url: `/pages/orders/orders?status=${status}` })
    },

    // 跳转套餐
    goToPackage: function () {
        wx.navigateTo({ url: '/pages/package-usage/package-usage' })
    },

    // 跳转裂变
    goToFission: function () {
        wx.navigateTo({ url: '/pages/fission/fission' })
    },

    // 跳转舌象历史
    goToTongue: function () {
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
    }
})
