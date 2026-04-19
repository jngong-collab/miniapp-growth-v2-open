const { cloud, db, _cmd } = require('./context')
const { buildAdminAuditEntry } = require('./admin-audit')
const { uniqueValues } = require('./helpers')

function getAccessStoreId(access) {
  const storeId = String((access && access.account && access.account.storeId) || '').trim()
  if (!storeId) {
    throw new Error('后台账号未绑定门店')
  }
  return storeId
}

function withStoreScope(storeId, condition = {}, storeField = 'storeId') {
  return {
    ...(condition || {}),
    [storeField]: storeId
  }
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

async function safeGetFirstByStore(collectionName, storeId, condition = {}, storeField = 'storeId') {
  return safeGetFirst(collectionName, withStoreScope(storeId, condition, storeField))
}

async function safeListByStore(collectionName, storeId, condition = {}, options = {}, storeField = 'storeId') {
  return safeList(collectionName, withStoreScope(storeId, condition, storeField), options)
}

async function safeGetByIdAndStore(collectionName, id, storeId, storeField = 'storeId') {
  const record = await safeGetById(collectionName, id)
  if (!record) return null
  return String(record[storeField] || '') === String(storeId || '') ? record : null
}

async function resolveCloudFileMap(fileList = []) {
  const uniqueFileList = uniqueValues((fileList || []).filter(item => item && String(item).startsWith('cloud://')).map(String))
  if (!uniqueFileList.length) return {}
  try {
    const res = await cloud.getTempFileURL({ fileList: uniqueFileList })
    return (res.fileList || []).reduce((acc, item) => {
      if (item.fileID && item.tempFileURL) {
        acc[item.fileID] = item.tempFileURL
      }
      return acc
    }, {})
  } catch (error) {
    return {}
  }
}

async function hydrateUsersAvatarUrls(users = []) {
  if (!Array.isArray(users) || !users.length) return []
  const fileMap = await resolveCloudFileMap(users.map(item => item && item.avatarUrl))
  return users.map(item => {
    const avatarFileId = String((item && item.avatarUrl) || '').trim()
    if (!avatarFileId.startsWith('cloud://')) {
      return {
        ...item,
        avatarFileId: '',
        avatarUrl: avatarFileId
      }
    }
    return {
      ...item,
      avatarFileId,
      avatarUrl: fileMap[avatarFileId] || ''
    }
  })
}

async function hydrateUserAvatarUrl(user) {
  if (!user) return null
  const [nextUser] = await hydrateUsersAvatarUrls([user])
  return nextUser || null
}

async function fetchUsersMap(openids) {
  const ids = uniqueValues(openids)
  if (!ids.length) return {}
  const users = await safeList('users', { _openid: _cmd.in(ids) }, { limit: ids.length })
  const hydratedUsers = await hydrateUsersAvatarUrls(users)
  return hydratedUsers.reduce((acc, item) => {
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
  withStoreScope,
  safeCount,
  safeGetFirst,
  safeGetById,
  safeList,
  safeGetFirstByStore,
  safeListByStore,
  safeGetByIdAndStore,
  hydrateUserAvatarUrl,
  hydrateUsersAvatarUrls,
  fetchUsersMap,
  fetchOrdersMap,
  writeAuditLog
}
