const { db, _cmd } = require('./context')
const { buildAdminAuditEntry } = require('./admin-audit')
const { uniqueValues } = require('./helpers')

function getAccessStoreId(access) {
  const storeId = String((access && access.account && access.account.storeId) || '').trim()
  if (!storeId) {
    throw new Error('后台账号未绑定门店')
  }
  return storeId
}

async function safeCount(collectionName, condition) {
  try {
    const res = await db.collection(collectionName).where(condition || {}).count()
    return res.total || 0
  } catch (error) {
    return 0
  }
}

async function safeGetFirst(collectionName, condition) {
  try {
    const res = await db.collection(collectionName).where(condition || {}).limit(1).get()
    return res.data[0] || null
  } catch (error) {
    return null
  }
}

async function safeGetById(collectionName, id) {
  try {
    const res = await db.collection(collectionName).doc(id).get()
    return res.data || null
  } catch (error) {
    return null
  }
}

async function safeList(collectionName, condition = {}, options = {}) {
  try {
    let query = db.collection(collectionName).where(condition)
    if (options.orderBy) {
      query = query.orderBy(options.orderBy[0], options.orderBy[1])
    }
    if (options.skip) query = query.skip(options.skip)
    query = query.limit(options.limit || 20)
    const res = await query.get()
    return res.data || []
  } catch (error) {
    return []
  }
}

async function fetchUsersMap(openids) {
  const ids = uniqueValues(openids)
  if (!ids.length) return {}
  const users = await safeList('users', { _openid: _cmd.in(ids) }, { limit: ids.length })
  return users.reduce((acc, item) => {
    acc[item._openid] = item
    return acc
  }, {})
}

async function fetchOrdersMap(orderIds) {
  const ids = uniqueValues(orderIds)
  if (!ids.length) return {}
  const orders = await safeList('orders', { _id: _cmd.in(ids) }, { limit: ids.length })
  return orders.reduce((acc, item) => {
    acc[item._id] = item
    return acc
  }, {})
}

async function writeAuditLog(access, payload) {
  const entry = buildAdminAuditEntry({
    actorUid: access.uid,
    actorName: access.account.displayName || access.account.username,
    storeId: getAccessStoreId(access),
    ...payload
  }, db.serverDate())
  return db.collection('admin_audit_logs').add({ data: entry }).catch(() => null)
}

module.exports = {
  db,
  _cmd,
  getAccessStoreId,
  safeCount,
  safeGetFirst,
  safeGetById,
  safeList,
  fetchUsersMap,
  fetchOrdersMap,
  writeAuditLog
}
