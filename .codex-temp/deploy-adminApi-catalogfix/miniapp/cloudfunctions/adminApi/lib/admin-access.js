const { ADMIN_PERMISSION_KEYS } = require('./admin-contract')

const ADMIN_WEB_PERMISSIONS = ADMIN_PERMISSION_KEYS

function normalizeAdminPermissions(permissions) {
  if (permissions == null) {
    return []
  }
  if (!Array.isArray(permissions)) {
    return []
  }
  if (permissions.length === 0) {
    return []
  }

  const normalized = []
  for (const permission of permissions) {
    if (ADMIN_PERMISSION_KEYS.includes(permission) && !normalized.includes(permission)) {
      normalized.push(permission)
    }
  }
  return normalized
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
  ADMIN_PERMISSION_KEYS,
  ADMIN_WEB_PERMISSIONS,
  normalizeAdminPermissions,
  buildAdminAccountRecord,
  canManagePermission
}
