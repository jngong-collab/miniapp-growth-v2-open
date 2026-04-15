const { db } = require('./context')
const { buildAdminAccountRecord, normalizeAdminPermissions } = require('./admin-access')
const { getAccessStoreId, safeGetById, safeGetFirst, safeList, writeAuditLog } = require('./data')

const ACCOUNT_STATUSES = ['active', 'disabled', 'pending_activation']

function normalizeAccountStatus(status, fallback = 'pending_activation') {
  return ACCOUNT_STATUSES.includes(status) ? status : fallback
}

function summarizeAdminAccount(account) {
  if (!account) return null
  return {
    _id: account._id,
    uid: account.uid || '',
    username: account.username || '',
    displayName: account.displayName || '',
    role: account.role || '',
    status: account.status || '',
    permissions: Array.isArray(account.permissions) ? account.permissions : [],
    storeId: account.storeId || '',
    lastLoginAt: account.lastLoginAt || null
  }
}

function mergeRoleTemplates(systemTemplates, storeTemplates) {
  const merged = new Map()
  ;[...(systemTemplates || []), ...(storeTemplates || [])].forEach(item => {
    const key = String(item.roleKey || item._id || '')
    if (!key) return
    merged.set(key, {
      ...item,
      permissions: normalizeAdminPermissions(item.permissions)
    })
  })
  return Array.from(merged.values()).sort((left, right) => {
    return String(left.roleKey || '').localeCompare(String(right.roleKey || ''))
  })
}

async function listMiniappStaff(access) {
  const store = await safeGetById('stores', getAccessStoreId(access))
  if (!store) return { code: -1, msg: '门店信息不存在' }

  return {
    code: 0,
    data: (store.staff || []).map(item => ({
      ...item,
      permissionsText: (item.permissions || []).join(' / ')
    }))
  }
}

async function updateMiniappStaffPermissions(access, event) {
  const { staffOpenid = '', permissions = [] } = event
  if (!staffOpenid || !Array.isArray(permissions)) return { code: -1, msg: '参数错误' }

  const storeId = getAccessStoreId(access)
  const store = await safeGetById('stores', storeId)
  if (!store) return { code: -1, msg: '门店信息不存在' }

  const staffList = store.staff || []
  const idx = staffList.findIndex(item => item.openid === staffOpenid)
  if (idx < 0) return { code: -1, msg: '员工不存在' }

  staffList[idx].permissions = Array.from(new Set(permissions.filter(Boolean)))
  await db.collection('stores').doc(storeId).update({
    data: { staff: staffList, updatedAt: db.serverDate() }
  })

  await writeAuditLog(access, {
    action: 'staff.updateMiniappStaffPermissions',
    module: 'staff',
    targetType: 'miniapp_staff',
    targetId: staffOpenid,
    summary: `更新员工权限 ${staffList[idx].name || staffOpenid}`,
    detail: { permissions: staffList[idx].permissions }
  })

  return { code: 0, data: staffList[idx], msg: '员工权限已更新' }
}

async function listRoleTemplates(access) {
  const storeId = getAccessStoreId(access)
  const [systemTemplates, storeTemplates] = await Promise.all([
    safeList('admin_role_templates', { isSystem: true }, {
      orderBy: ['roleKey', 'asc'],
      limit: 50
    }),
    safeList('admin_role_templates', { storeId }, {
      orderBy: ['roleKey', 'asc'],
      limit: 50
    })
  ])

  return {
    code: 0,
    data: mergeRoleTemplates(systemTemplates, storeTemplates)
  }
}

async function listAdminAccounts(access) {
  const storeId = getAccessStoreId(access)
  const records = await safeList('admin_accounts', { storeId }, {
    orderBy: ['createdAt', 'desc'],
    limit: 100
  })
  return { code: 0, data: records }
}

async function createAdminAccount(access, event) {
  const payload = event.payload || {}
  const storeId = getAccessStoreId(access)
  const uid = String(payload.uid || '').trim()
  const username = String(payload.username || '').trim()
  const displayName = String(payload.displayName || '').trim()

  if (!username || !displayName) {
    return { code: -1, msg: '账号信息不完整' }
  }

  const [existingByUid, existingByUsername] = await Promise.all([
    uid ? safeGetFirst('admin_accounts', { uid }) : Promise.resolve(null),
    safeGetFirst('admin_accounts', { storeId, username })
  ])

  if (existingByUid) return { code: -1, msg: '该登录 UID 已绑定后台账号' }
  if (existingByUsername) return { code: -1, msg: '该用户名已存在' }

  const requestedStatus = normalizeAccountStatus(payload.status, uid ? 'active' : 'pending_activation')
  const recordStatus = uid
    ? requestedStatus
    : (requestedStatus === 'active' ? 'pending_activation' : requestedStatus)
  const now = db.serverDate()
  const record = buildAdminAccountRecord({
    uid,
    username,
    displayName,
    role: String(payload.role || 'operator').trim() || 'operator',
    status: recordStatus,
    permissions: Array.isArray(payload.permissions) ? payload.permissions : [],
    storeId,
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now
  }, now)
  const addRes = await db.collection('admin_accounts').add({ data: record })
  const created = await safeGetById('admin_accounts', addRes._id) || { _id: addRes._id, ...record }

  await writeAuditLog(access, {
    action: 'staff.createAdminAccount',
    module: 'staff',
    targetType: 'admin_account',
    targetId: created._id || created.username,
    summary: `创建后台账号 ${created.displayName || created.username}`,
    detail: { after: summarizeAdminAccount(created) }
  })

  return {
    code: 0,
    data: created,
    msg: created.uid ? '后台账号已创建' : '后台账号已创建，待绑定登录 UID'
  }
}

async function updateAdminAccountStatus(access, event) {
  const storeId = getAccessStoreId(access)
  const uid = String(event.uid || '').trim()
  const status = normalizeAccountStatus(event.status, '')
  if (!uid || !status) return { code: -1, msg: '参数错误' }

  const account = await safeGetFirst('admin_accounts', { uid, storeId })
  if (!account) return { code: -1, msg: '后台账号不存在' }
  if (status === 'active' && !String(account.uid || '').trim()) {
    return { code: -1, msg: '后台账号尚未绑定登录 UID' }
  }

  const before = summarizeAdminAccount(account)
  await db.collection('admin_accounts').doc(account._id).update({
    data: { status, updatedAt: db.serverDate() }
  })
  const updated = await safeGetById('admin_accounts', account._id) || { ...account, status }

  await writeAuditLog(access, {
    action: 'staff.updateAdminAccountStatus',
    module: 'staff',
    targetType: 'admin_account',
    targetId: account._id || uid,
    summary: `更新后台账号状态 ${account.displayName || account.username}`,
    detail: {
      before,
      after: summarizeAdminAccount(updated)
    }
  })

  return { code: 0, data: updated, msg: '后台账号状态已更新' }
}

async function updateAdminAccountPermissions(access, event) {
  const storeId = getAccessStoreId(access)
  const uid = String(event.uid || '').trim()
  if (!uid || !Array.isArray(event.permissions)) return { code: -1, msg: '参数错误' }

  const account = await safeGetFirst('admin_accounts', { uid, storeId })
  if (!account) return { code: -1, msg: '后台账号不存在' }

  const nextRole = String(event.role || '').trim()
  const nextPermissions = normalizeAdminPermissions(event.permissions)
  const before = summarizeAdminAccount(account)
  const updateData = {
    permissions: nextPermissions,
    updatedAt: db.serverDate()
  }
  if (nextRole) {
    updateData.role = nextRole
  }

  await db.collection('admin_accounts').doc(account._id).update({ data: updateData })
  const updated = await safeGetById('admin_accounts', account._id) || {
    ...account,
    ...updateData
  }

  await writeAuditLog(access, {
    action: 'staff.updateAdminAccountPermissions',
    module: 'staff',
    targetType: 'admin_account',
    targetId: account._id || uid,
    summary: `更新后台账号权限 ${account.displayName || account.username}`,
    detail: {
      before,
      after: summarizeAdminAccount(updated)
    }
  })

  return { code: 0, data: updated, msg: '后台账号权限已更新' }
}

async function listAdminLoginEvents(access, event) {
  const page = Math.max(1, Number(event.page || 1) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(event.pageSize || 30) || 30))
  const storeId = getAccessStoreId(access)
  const logs = await safeList('admin_login_events', { storeId }, {
    orderBy: ['createdAt', 'desc'],
    limit: 300
  })
  const start = (page - 1) * pageSize

  return {
    code: 0,
    data: {
      list: logs.slice(start, start + pageSize),
      total: logs.length,
      page,
      pageSize
    }
  }
}

async function listAuditLogs(access, event) {
  const page = Number(event.page || 1)
  const pageSize = Number(event.pageSize || 30)
  const storeId = getAccessStoreId(access)
  const { module = '', action = '', dateRange = [] } = event || {}
  const [startAt, endAt] = Array.isArray(dateRange) ? dateRange : []
  const startTimestamp = startAt ? new Date(startAt).getTime() : 0
  const endTimestamp = endAt ? new Date(endAt).getTime() : 0

  let condition = { storeId }
  if (module) condition = { ...condition, module }

  const logs = await safeList('admin_audit_logs', condition, {
    orderBy: ['createdAt', 'desc'],
    limit: 500
  })

  const filtered = logs.filter((log) => {
    const ts = log.createdAt ? new Date(log.createdAt).getTime() : 0
    if (startTimestamp && ts < startTimestamp) return false
    if (endTimestamp && ts > endTimestamp + 24 * 60 * 60 * 1000 - 1) return false
    if (action && !(log.action || '').toLowerCase().includes(action.toLowerCase())) return false
    return true
  })

  const start = (page - 1) * pageSize
  return {
    code: 0,
    data: {
      list: filtered.slice(start, start + pageSize),
      total: filtered.length,
      page,
      pageSize
    }
  }
}

module.exports = {
  listMiniappStaff,
  updateMiniappStaffPermissions,
  listRoleTemplates,
  listAdminAccounts,
  createAdminAccount,
  updateAdminAccountStatus,
  updateAdminAccountPermissions,
  listAdminLoginEvents,
  listAuditLogs
}
