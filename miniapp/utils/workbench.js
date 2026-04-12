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

function ensureWorkbenchAccess(page, options = {}) {
    const app = getApp()
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
