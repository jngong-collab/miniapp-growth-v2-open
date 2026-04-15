const { db, requireAdminAccess } = require('./context')
const { sanitizeStore } = require('./helpers')

async function getAdminMe() {
  const access = await requireAdminAccess('')
  if (access.code) return access

  await db.collection('admin_accounts').doc(access.account._id).update({
    data: {
      lastLoginAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  }).catch(() => null)

  return {
    code: 0,
    data: {
      uid: access.uid,
      username: access.account.username,
      displayName: access.account.displayName || access.account.username,
      role: access.account.role || 'owner',
      status: access.account.status || 'active',
      permissions: access.permissions,
      routePermissions: access.routePermissions,
      storeId: access.account.storeId,
      storeName: access.store.name || '',
      storeInfo: sanitizeStore(access.store)
    }
  }
}

module.exports = {
  getAdminMe
}
