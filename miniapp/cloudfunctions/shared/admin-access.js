const ADMIN_WEB_PERMISSIONS = [
  'viewDashboard',
  'viewOrders',
  'manageRefunds',
  'manageProducts',
  'manageCampaigns',
  'viewLeads',
  'manageSettings',
  'manageStaff',
  'viewAuditLogs'
]

function normalizeAdminPermissions(permissions) {
  const source = Array.isArray(permissions) ? permissions : ADMIN_WEB_PERMISSIONS
  return Array.from(new Set(
    source.filter(permission => permission && ADMIN_WEB_PERMISSIONS.includes(permission))
  ))
}

function buildAdminAccountRecord(input, serverDate) {
  const now = serverDate || new Date()
  return {
    uid: String(input.uid || '').trim(),
    username: String(input.username || '').trim(),
    storeId: String(input.storeId || '').trim(),
    role: input.role || 'owner',
    status: input.status || 'active',
    permissions: normalizeAdminPermissions(input.permissions),
    displayName: input.displayName || input.username || '管理员',
    lastLoginAt: input.lastLoginAt || null,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now
  }
}

function canManagePermission(permissions, permission) {
  if (!permission) return true
  if (!Array.isArray(permissions)) return false
  return permissions.includes(permission)
}

module.exports = {
  ADMIN_WEB_PERMISSIONS,
  normalizeAdminPermissions,
  buildAdminAccountRecord,
  canManagePermission
}
