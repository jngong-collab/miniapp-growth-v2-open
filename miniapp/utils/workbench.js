const WORKBENCH_WAIT_KEY = '__workbenchRoleWaitTimer'

function normalizeRole(role) {
    if (role === 'admin' || role === 'staff') return role
    if (role === 'user') return 'customer'
    return 'customer'
}

function isWorkbenchUser(role) {
    const normalized = normalizeRole(role)
    return normalized === 'admin' || normalized === 'staff'
}

function hasWorkbenchPermission(permissions, permission) {
    return Array.isArray(permissions) && permissions.includes(permission)
}

function clearWorkbenchWait(target) {
    if (!target || !target[WORKBENCH_WAIT_KEY]) return
    clearTimeout(target[WORKBENCH_WAIT_KEY])
    target[WORKBENCH_WAIT_KEY] = null
}

function trackLegacyRolePromise(globalData) {
    const promise = globalData && globalData._rolePromise
    if (!promise || promise.__workbenchTracked) return

    promise.__workbenchTracked = true
    globalData._rolePromiseSettled = false
    Promise.resolve(promise).finally(() => {
        if (globalData._rolePromise === promise) {
            globalData._rolePromiseSettled = true
        }
    })
}

function isRoleLoading(globalData) {
    if (!globalData) return false
    if (globalData._roleReady === false) return true

    const looksLikeColdStartCustomer = normalizeRole(globalData.role) === 'customer' && !(globalData.permissions || []).length
    if (!looksLikeColdStartCustomer || !globalData._rolePromise) return false

    trackLegacyRolePromise(globalData)
    return globalData._rolePromiseSettled !== true
}

function scheduleWorkbenchWait(app, page, options) {
    const target = page || app
    if (!target || target[WORKBENCH_WAIT_KEY]) return

    const poll = () => {
        if (isRoleLoading(app.globalData)) {
            target[WORKBENCH_WAIT_KEY] = setTimeout(poll, 30)
            return
        }

        target[WORKBENCH_WAIT_KEY] = null
        ensureWorkbenchAccess(page, options)
    }

    target[WORKBENCH_WAIT_KEY] = setTimeout(poll, 30)
}

function ensureWorkbenchAccess(page, options = {}) {
    const app = getApp()

    // 冷启动时按“角色是否已完成加载”判定；就绪前只等待，不提前把员工误判为 customer。
    if (isRoleLoading(app.globalData)) {
        scheduleWorkbenchWait(app, page, options)
        return null
    }

    clearWorkbenchWait(page || app)

    const role = normalizeRole(app.globalData.role)
    const permissions = app.globalData.permissions || []
    const requiredPermission = options.requiredPermission || ''

    if (!isWorkbenchUser(role)) {
        wx.showToast({ title: '暂无工作台权限', icon: 'none' })
        setTimeout(() => wx.navigateBack({ delta: 1 }), 200)
        return null
    }

    if (requiredPermission && !hasWorkbenchPermission(permissions, requiredPermission) && role !== 'admin') {
        wx.showToast({ title: '暂无访问权限', icon: 'none' })
        setTimeout(() => wx.navigateBack({ delta: 1 }), 200)
        return null
    }

    const access = {
        role,
        permissions,
        staffName: app.globalData.workbenchAccess?.staffName || ''
    }

    if (page && typeof page.setData === 'function') {
        page.setData({
            role,
            permissions,
            workbenchStaffName: access.staffName
        })
    }

    return access
}

module.exports = {
    normalizeRole,
    isWorkbenchUser,
    hasWorkbenchPermission,
    ensureWorkbenchAccess
}
