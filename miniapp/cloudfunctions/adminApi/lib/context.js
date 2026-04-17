const cloud = require('wx-server-sdk')
const tcb = require('@cloudbase/node-sdk')
const { ADMIN_ROUTE_PERMISSIONS } = require('./admin-contract')
const { canManagePermission, normalizeAdminPermissions } = require('./admin-access')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const adminApp = tcb.init({
  env: process.env.TCB_ENV || process.env.SCF_NAMESPACE || process.env.TCB_ENV_ID || ''
})
const auth = adminApp.auth()

const LEGACY_PERMISSION_ALIASES = {
  viewDashboard: 'dashboard.view',
  viewOrders: 'orders.view',
  manageRefunds: 'orders.refund.review',
  manageProducts: 'catalog.manage',
  manageCampaigns: 'campaigns.manage',
  viewLeads: 'crm.view',
  manageCustomers: 'crm.manage',
  manageSettings: 'settings.manage',
  manageStaff: 'staff.manage',
  viewAuditLogs: 'audit.view'
}

function getCurrentUid() {
  try {
    const userInfo = auth.getUserInfo() || {}
    return userInfo.uid || userInfo.customUserId || ''
  } catch (error) {
    return ''
  }
}

function normalizeRequestedPermission(permission) {
  const next = String(permission || '').trim()
  return LEGACY_PERMISSION_ALIASES[next] || next
}

function normalizeAccountPermissions(permissions) {
  if (!Array.isArray(permissions)) return []
  const normalized = permissions.map(item => LEGACY_PERMISSION_ALIASES[item] || item)
  return normalizeAdminPermissions(normalized)
}

async function requireAdminAccess(permission = '') {
  const uid = getCurrentUid()
  if (!uid) {
    return { code: 401, msg: '未登录或登录状态已失效' }
  }

  const accountRes = await db.collection('admin_accounts').where({ uid }).limit(1).get().catch(() => ({ data: [] }))
  const account = accountRes.data[0] || null
  if (!account) {
    return { code: 403, msg: '当前账号未开通老板后台权限' }
  }
  if ((account.status || 'active') !== 'active') {
    return { code: 403, msg: '后台账号已停用' }
  }
  if (!account.storeId) {
    return { code: 403, msg: '后台账号未绑定门店' }
  }

  const store = await db.collection('stores').doc(account.storeId).get().then(res => res.data).catch(() => null)

  if (!store) {
    return { code: 403, msg: '门店信息不存在' }
  }

  const permissions = normalizeAccountPermissions(account.permissions)
  const requestedPermission = normalizeRequestedPermission(permission)

  if (requestedPermission && !canManagePermission(permissions, requestedPermission)) {
    return { code: 403, msg: '无访问权限' }
  }

  return {
    code: 0,
    uid,
    permissions,
    routePermissions: ADMIN_ROUTE_PERMISSIONS,
    account: {
      ...account,
      permissions,
      storeId: account.storeId
    },
    store
  }
}

module.exports = {
  cloud,
  db,
  _cmd: db.command,
  getCurrentUid,
  requireAdminAccess
}
