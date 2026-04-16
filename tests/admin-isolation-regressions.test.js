const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('module')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..')

const dbCommand = {
  gte: (value) => ({ _op: 'gte', value }),
  gt: (value) => ({ _op: 'gt', value }),
  in: (value) => ({ _op: 'in', value }),
  inc: (value) => ({ _op: 'inc', value })
}

function mockModule(modulePath, exports) {
  const original = require.cache[modulePath]
  const mock = new Module(modulePath, module)
  mock.filename = modulePath
  mock.loaded = true
  mock.exports = exports
  require.cache[modulePath] = mock
  return () => {
    delete require.cache[modulePath]
    if (original) {
      require.cache[modulePath] = original
    }
  }
}

function unloadModule(modulePath) {
  delete require.cache[modulePath]
}

test('runtime admin access permission normalization distinguishes nullish, empty arrays, and illegal keys', () => {
  const adminAccessPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'admin-access.js')
  unloadModule(adminAccessPath)

  try {
    const { normalizeAdminPermissions } = require(adminAccessPath)

    assert.deepEqual(normalizeAdminPermissions(undefined), [])
    assert.deepEqual(normalizeAdminPermissions(null), [])
    assert.deepEqual(normalizeAdminPermissions([]), [])
    assert.deepEqual(normalizeAdminPermissions(['dashboard.view', 'dashboard.view']), ['dashboard.view'])
    assert.deepEqual(normalizeAdminPermissions(['dashboard.view', 'illegal.permission']), ['dashboard.view'])
  } finally {
    unloadModule(adminAccessPath)
  }
})

test('orders reject cross-store detail access and refund review', async () => {
  const ordersPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'modules-orders.js')
  const dataPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'data.js')
  const refundPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'refund.js')
  const contextPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'context.js')

  unloadModule(ordersPath)

  let transactionCalled = false
  const restoreData = mockModule(dataPath, {
    getAccessStoreId: (access) => access.account.storeId,
    safeGetByIdAndStore: async (collection, id, storeId) => {
      if (collection === 'orders') {
        return storeId === 'store-b' ? { _id: id, orderNo: 'ORD-1', storeId: 'store-b', _openid: 'user-1', status: 'paid' } : null
      }
      return null
    },
    safeGetById: async (collection, id) => {
      if (collection === 'orders') {
        return { _id: id, orderNo: 'ORD-1', storeId: 'store-b', _openid: 'user-1', status: 'paid' }
      }
      if (collection === 'refund_requests') {
        return { _id: id, orderId: 'order-1', status: 'pending', previousStatus: 'paid' }
      }
      return null
    },
    safeGetFirst: async () => null,
    safeList: async () => [],
    fetchOrdersMap: async () => ({}),
    fetchUsersMap: async () => ({}),
    writeAuditLog: async () => null,
    _cmd: dbCommand
  })
  const restoreRefund = mockModule(refundPath, {
    approveRefundRequest: async () => ({ code: 0, msg: 'should not be called' })
  })
  const restoreContext = mockModule(contextPath, {
    db: {
      serverDate: () => new Date('2026-04-15T00:00:00Z'),
      runTransaction: async () => {
        transactionCalled = true
      }
    },
    _cmd: dbCommand
  })

  try {
    const { getOrderDetail, reviewRefund } = require(ordersPath)
    const access = { uid: 'admin-1', account: { storeId: 'store-a', username: 'boss' } }

    const detailRes = await getOrderDetail(access, { orderId: 'order-1' })
    assert.equal(detailRes.code, -1)
    assert.match(detailRes.msg, /无权限|门店/)

    const refundRes = await reviewRefund(access, {
      requestId: 'refund-1',
      orderId: 'order-1',
      status: 'rejected'
    })
    assert.equal(refundRes.code, -1)
    assert.match(refundRes.msg, /无权限|门店/)
    assert.equal(transactionCalled, false)
  } finally {
    restoreData()
    restoreRefund()
    restoreContext()
    unloadModule(ordersPath)
  }
})

test('orders reject cross-store verification lookup', async () => {
  const ordersPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'modules-orders.js')
  const dataPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'data.js')
  const refundPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'refund.js')

  unloadModule(ordersPath)

  const restoreData = mockModule(dataPath, {
    getAccessStoreId: (access) => access.account.storeId,
    safeGetByIdAndStore: async () => null,
    safeGetById: async (collection, id) => {
      if (collection === 'orders') {
        return { _id: id, storeId: 'store-b', status: 'paid' }
      }
      return null
    },
    safeGetFirst: async () => null,
    safeList: async (collection) => {
      if (collection === 'order_items') {
        return [{ _id: 'item-1', orderId: 'order-1', verifyCode: 'VC-1', productType: 'service' }]
      }
      return []
    },
    fetchOrdersMap: async () => ({}),
    fetchUsersMap: async () => ({}),
    writeAuditLog: async () => null,
    _cmd: dbCommand
  })
  const restoreRefund = mockModule(refundPath, {
    approveRefundRequest: async () => ({ code: 0 })
  })

  try {
    const { queryVerifyCode } = require(ordersPath)
    const result = await queryVerifyCode({ account: { storeId: 'store-a' } }, { verifyCode: 'VC-1' })
    assert.equal(result.code, -1)
    assert.match(result.msg, /无权限|门店/)
  } finally {
    restoreData()
    restoreRefund()
    unloadModule(ordersPath)
  }
})

test('orders list and verification record queries are store-scoped before joining child tables', async () => {
  const ordersPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'modules-orders.js')
  const dataPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'data.js')
  const refundPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'refund.js')

  unloadModule(ordersPath)

  const calls = []
  const restoreData = mockModule(dataPath, {
    getAccessStoreId: (access) => access.account.storeId,
    safeGetByIdAndStore: async () => null,
    safeGetById: async () => null,
    safeGetFirst: async () => null,
    safeList: async (collection, condition, options) => {
      calls.push({ collection, condition, options })
      if (collection === 'orders') {
        return [{ _id: 'order-1', storeId: 'store-a', _openid: 'user-1', status: 'paid', createdAt: new Date() }]
      }
      if (collection === 'order_items') {
        return [{ _id: 'item-1', orderId: 'order-1', productType: 'service', verifyCode: 'VC-1', productName: '服务', createdAt: new Date() }]
      }
      if (collection === 'refund_requests' || collection === 'package_usage') {
        return []
      }
      return []
    },
    fetchOrdersMap: async () => ({
      'order-1': { _id: 'order-1', storeId: 'store-a', _openid: 'user-1', status: 'paid', createdAt: new Date() }
    }),
    fetchUsersMap: async () => ({ 'user-1': { _openid: 'user-1', nickName: '客户A' } }),
    writeAuditLog: async () => null,
    _cmd: dbCommand
  })
  const restoreRefund = mockModule(refundPath, {
    approveRefundRequest: async () => ({ code: 0 })
  })

  try {
    const { listOrders, listVerificationRecords } = require(ordersPath)
    const access = { account: { storeId: 'store-a' } }

    await listOrders(access, {})
    await listVerificationRecords(access, {})

    const orderCalls = calls.filter((call) => call.collection === 'orders')
    assert.ok(orderCalls.length >= 2, 'expected store orders to be loaded')
    orderCalls.forEach((call) => {
      assert.equal(call.condition.storeId, 'store-a')
    })

    const packageUsageCall = calls.find((call) => call.collection === 'package_usage')
    assert.ok(packageUsageCall, 'expected package_usage query')
    assert.ok(packageUsageCall.condition.orderItemId, 'package_usage should be filtered by store order item ids')
  } finally {
    restoreData()
    restoreRefund()
    unloadModule(ordersPath)
  }
})

test('settings read paths scope pay, ai, and notification config by storeId', async () => {
  const settingsPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'modules-settings.js')
  const dataPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'data.js')
  const contextPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'context.js')

  unloadModule(settingsPath)

  const safeGetFirstCalls = []
  const restoreData = mockModule(dataPath, {
    getAccessStoreId: (access) => access.account.storeId,
    safeGetById: async () => ({ _id: 'store-a', name: '门店A' }),
    safeGetFirstByStore: async (collection, storeId, condition = {}) => {
      const scopedCondition = { ...condition, storeId }
      safeGetFirstCalls.push({ collection, condition: scopedCondition })
      return { _id: `${collection}-1`, storeId: scopedCondition.storeId }
    },
    safeGetFirst: async (collection, condition) => {
      safeGetFirstCalls.push({ collection, condition })
      return { _id: `${collection}-1`, storeId: condition.storeId }
    },
    safeList: async () => [],
    writeAuditLog: async () => null
  })
  const restoreContext = mockModule(contextPath, {
    db: { serverDate: () => new Date('2026-04-15T00:00:00Z') }
  })

  try {
    const { getSettings } = require(settingsPath)
    const result = await getSettings({ account: { storeId: 'store-a' } })
    assert.equal(result.code, 0)

    const aiCall = safeGetFirstCalls.find((call) => call.collection === 'ai_config')
    const payCall = safeGetFirstCalls.find((call) => call.collection === 'pay_config')
    const notificationCall = safeGetFirstCalls.find((call) => call.collection === 'notification_settings')

    assert.equal(aiCall.condition.storeId, 'store-a')
    assert.equal(payCall.condition.storeId, 'store-a')
    assert.equal(notificationCall.condition.storeId, 'store-a')
  } finally {
    restoreData()
    restoreContext()
    unloadModule(settingsPath)
  }
})

test('settings update paths persist storeId-scoped config and do not crash on notification updates', async () => {
  const settingsPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'modules-settings.js')
  const dataPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'data.js')
  const contextPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'context.js')

  unloadModule(settingsPath)

  const safeGetFirstCalls = []
  const writes = []
  const storeId = 'store-a'

  const restoreData = mockModule(dataPath, {
    getAccessStoreId: (access) => access.account.storeId,
    safeGetById: async () => null,
    safeGetFirstByStore: async (collection, scopedStoreId, condition = {}) => {
      const scopedCondition = { ...condition, storeId: scopedStoreId }
      safeGetFirstCalls.push({ collection, condition: scopedCondition })
      return { _id: `${collection}-1`, storeId }
    },
    safeGetFirst: async () => null,
    safeList: async () => [],
    writeAuditLog: async () => null
  })
  const restoreContext = mockModule(contextPath, {
    db: {
      serverDate: () => new Date('2026-04-15T00:00:00Z'),
      collection: (collectionName) => ({
        doc: (id) => ({
          update: async ({ data }) => {
            writes.push({ collectionName, mode: 'update', id, data })
            return { stats: { updated: 1 } }
          }
        }),
        add: async ({ data }) => {
          writes.push({ collectionName, mode: 'add', data })
          return { _id: `${collectionName}-new` }
        }
      })
    }
  })

  try {
    const {
      updatePayConfig,
      updateAiConfig,
      updateNotificationConfig
    } = require(settingsPath)
    const access = { uid: 'admin-1', account: { storeId, username: 'boss' } }

    const payRes = await updatePayConfig(access, { payload: { mchId: '1900000109', mchKey: 'secret' } })
    const aiRes = await updateAiConfig(access, { payload: { apiUrl: 'https://ai.test', apiKey: 'secret' } })
    const notificationRes = await updateNotificationConfig(access, { payload: { adminPhones: ['13800000000'] } })

    assert.equal(payRes.code, 0)
    assert.equal(aiRes.code, 0)
    assert.equal(notificationRes.code, 0)

    const payRead = safeGetFirstCalls.find((call) => call.collection === 'pay_config')
    const aiRead = safeGetFirstCalls.find((call) => call.collection === 'ai_config')
    const notificationRead = safeGetFirstCalls.find((call) => call.collection === 'notification_settings')

    assert.equal(payRead.condition.storeId, storeId)
    assert.equal(aiRead.condition.storeId, storeId)
    assert.equal(notificationRead.condition.storeId, storeId)

    const payWrite = writes.find((entry) => entry.collectionName === 'pay_config')
    const aiWrite = writes.find((entry) => entry.collectionName === 'ai_config')
    const notificationWrite = writes.find((entry) => entry.collectionName === 'notification_settings')

    assert.equal(payWrite.data.storeId, storeId)
    assert.equal(aiWrite.data.storeId, storeId)
    assert.equal(notificationWrite.data.storeId, storeId)
  } finally {
    restoreData()
    restoreContext()
    unloadModule(settingsPath)
  }
})

test('catalog savePackage update path rejects cross-store packages and non-package products', async () => {
  const catalogPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'modules-catalog.js')
  const dataPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'data.js')
  const contextPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'context.js')

  unloadModule(catalogPath)

  let updateCalled = false
  const restoreData = mockModule(dataPath, {
    getAccessStoreId: (access) => access.account.storeId,
    safeGetById: async (collection, id) => {
      if (collection === 'packages' && id === 'pkg-cross') {
        return { _id: 'pkg-cross', storeId: 'store-b', productId: 'prod-package' }
      }
      if (collection === 'packages' && id === 'pkg-own') {
        return { _id: 'pkg-own', storeId: 'store-a', productId: 'prod-service' }
      }
      if (collection === 'products' && id === 'prod-package') {
        return { _id: 'prod-package', storeId: 'store-a', type: 'package', name: '套餐商品' }
      }
      if (collection === 'products' && id === 'prod-service') {
        return { _id: 'prod-service', storeId: 'store-a', type: 'service', name: '服务商品' }
      }
      return null
    },
    safeList: async () => [],
    writeAuditLog: async () => null
  })
  const restoreContext = mockModule(contextPath, {
    db: {
      serverDate: () => new Date('2026-04-15T00:00:00Z'),
      collection: () => ({
        doc: () => ({
          update: async () => {
            updateCalled = true
            return { stats: { updated: 1 } }
          }
        }),
        add: async () => ({ _id: 'pkg-new' })
      })
    },
    _cmd: dbCommand
  })

  try {
    const { savePackage } = require(catalogPath)
    const access = { account: { storeId: 'store-a' } }

    const crossStoreRes = await savePackage(access, {
      payload: {
        _id: 'pkg-cross',
        productId: 'prod-package',
        items: [{ name: '推拿', count: 1 }]
      }
    })
    assert.equal(crossStoreRes.code, -1)
    assert.match(crossStoreRes.msg, /无权限|门店/)

    const wrongTypeRes = await savePackage(access, {
      payload: {
        _id: 'pkg-own',
        productId: 'prod-service',
        items: [{ name: '推拿', count: 1 }]
      }
    })
    assert.equal(wrongTypeRes.code, -1)
    assert.match(wrongTypeRes.msg, /套餐|type=package|商品类型/)
    assert.equal(updateCalled, false)
  } finally {
    restoreData()
    restoreContext()
    unloadModule(catalogPath)
  }
})

test('leads and customers scope lookups through the current store instead of global scans', async () => {
  const leadsPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'modules-leads.js')
  const dataPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'data.js')
  const contextPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'context.js')

  unloadModule(leadsPath)

  const calls = []
  const writes = []
  const restoreData = mockModule(dataPath, {
    getAccessStoreId: (access) => access.account.storeId,
    safeGetFirst: async (collection, condition) => {
      calls.push({ method: 'safeGetFirst', collection, condition })
      if (collection === 'users') {
        return { _openid: condition._openid, storeId: condition.storeId, nickName: '客户A' }
      }
      return null
    },
    safeList: async (collection, condition, options) => {
      calls.push({ method: 'safeList', collection, condition, options })
      if (collection === 'users') {
        return [{ _openid: 'user-1', storeId: 'store-a', nickName: '客户A', createdAt: new Date() }]
      }
      if (collection === 'fission_campaigns') {
        return [{ _id: 'camp-1', storeId: 'store-a' }]
      }
      if (collection === 'orders') {
        return [{ _id: 'order-1', _openid: 'user-1', storeId: 'store-a', status: 'paid', createdAt: new Date() }]
      }
      return []
    },
    safeListByStore: async (collection, storeId, condition, options) => {
      const scopedCondition = { ...(condition || {}), storeId }
      calls.push({ method: 'safeList', collection, condition: scopedCondition, options })
      if (collection === 'users') {
        return [{ _openid: 'user-1', storeId: 'store-a', nickName: '客户A', createdAt: new Date() }]
      }
      return []
    },
    fetchUsersMap: async () => ({ 'user-1': { _openid: 'user-1', nickName: '客户A' } }),
    writeAuditLog: async () => null,
    _cmd: dbCommand
  })
  const restoreContext = mockModule(contextPath, {
    db: {
      serverDate: () => new Date('2026-04-15T00:00:00Z'),
      collection: () => ({
        where: (condition) => ({
          limit: () => ({
            get: async () => {
              calls.push({ method: 'db.where', collection: 'customer_followups', condition })
              return { data: [] }
            }
          })
        }),
        doc: () => ({
          update: async ({ data }) => {
            writes.push(data)
            return { stats: { updated: 1 } }
          }
        }),
        add: async ({ data }) => {
          writes.push(data)
          return { _id: 'followup-1' }
        }
      })
    },
    _cmd: dbCommand
  })

  try {
    const {
      listLeads,
      listCustomers,
      getCustomerDetail,
      saveFollowup
    } = require(leadsPath)
    const access = { uid: 'admin-1', account: { storeId: 'store-a', username: 'boss', displayName: '老板' } }

    await listLeads(access, {})
    await listCustomers(access, {})
    await getCustomerDetail(access, { openid: 'user-1' })
    await saveFollowup(access, { leadOpenid: 'user-1', note: '已回访' })

    const userListCall = calls.find((call) => call.method === 'safeList' && call.collection === 'users')
    assert.equal(userListCall.condition.storeId, 'store-a')

    const leadOrderCall = calls.find((call) => call.method === 'safeList' && call.collection === 'orders')
    assert.equal(leadOrderCall.condition.storeId, 'store-a')

    const tongueCall = calls.find((call) => call.method === 'safeList' && call.collection === 'tongue_reports')
    const lotteryCall = calls.find((call) => call.method === 'safeList' && call.collection === 'lottery_records')
    const campaignCall = calls.find((call) => call.method === 'safeList' && call.collection === 'fission_campaigns')
    const fissionCall = calls.find((call) => call.method === 'safeList' && call.collection === 'fission_records')
    const followupListCall = calls.find((call) => call.method === 'safeList' && call.collection === 'customer_followups')
    const customerCall = calls.find((call) => call.method === 'safeGetFirst' && call.collection === 'users')

    assert.ok(tongueCall.condition._openid, 'tongue_reports should be filtered by store user openids')
    assert.ok(lotteryCall.condition._openid, 'lottery_records should be filtered by store user openids')
    assert.equal(campaignCall.condition.storeId, 'store-a')
    assert.ok(fissionCall.condition.campaignId, 'fission_records should be filtered by store campaign ids')
    assert.equal(followupListCall.condition.storeId, 'store-a')
    assert.equal(customerCall.condition.storeId, 'store-a')

    assert.equal(writes[0].storeId, 'store-a')
  } finally {
    restoreData()
    restoreContext()
    unloadModule(leadsPath)
  }
})

test('campaign list builds lottery stats from store-owned campaigns only', async () => {
  const campaignsPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'modules-campaigns.js')
  const dataPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'data.js')
  const contextPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'context.js')

  unloadModule(campaignsPath)

  const calls = []
  const restoreData = mockModule(dataPath, {
    getAccessStoreId: (access) => access.account.storeId,
    safeGetById: async () => null,
    safeList: async (collection, condition, options) => {
      calls.push({ collection, condition, options })
      if (collection === 'fission_campaigns') return []
      if (collection === 'lottery_campaigns') return [{ _id: 'lottery-1', storeId: 'store-a', name: '抽奖活动' }]
      if (collection === 'lottery_records') return []
      return []
    },
    writeAuditLog: async () => null
  })
  const restoreContext = mockModule(contextPath, {
    db: { serverDate: () => new Date('2026-04-15T00:00:00Z') },
    _cmd: dbCommand
  })

  try {
    const { listCampaigns } = require(campaignsPath)
    await listCampaigns({ account: { storeId: 'store-a' } })

    const lotteryRecordsCall = calls.find((call) => call.collection === 'lottery_records')
    assert.ok(lotteryRecordsCall, 'expected lottery_records query')
    assert.ok(lotteryRecordsCall.condition.campaignId, 'lottery_records should be filtered by store campaign ids')
  } finally {
    restoreData()
    restoreContext()
    unloadModule(campaignsPath)
  }
})

test('refund helper reads pay config from the order store', async () => {
  const refundPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'refund.js')
  const dataPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'data.js')
  const contextPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'context.js')
  const refundStateMachinePath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'refund-state-machine.js')

  unloadModule(refundPath)

  const calls = []
  const restoreData = mockModule(dataPath, {
    safeGetFirstByStore: async (collection, storeId, condition = {}) => {
      const scopedCondition = { ...condition, storeId }
      calls.push({ collection, condition: scopedCondition })
      return null
    },
    safeGetFirst: async () => null,
    safeGetById: async () => null,
    safeList: async () => []
  })
  const restoreContext = mockModule(contextPath, {
    cloud: { DYNAMIC_CURRENT_ENV: 'test-env', cloudPay: { refund: async () => ({}) } },
    db: { serverDate: () => new Date('2026-04-15T00:00:00Z') },
    _cmd: dbCommand
  })
  const restoreStateMachine = mockModule(refundStateMachinePath, {
    planEnterRefunding: () => ({}),
    planFinalizeRefund: () => ({ requestUpdate: {}, orderUpdate: {} })
  })

  try {
    const { approveRefundRequest } = require(refundPath)
    const result = await approveRefundRequest({
      request: { _id: 'refund-1', refundAmount: 100 },
      order: { _id: 'order-1', orderNo: 'ORD-1', storeId: 'store-a', payAmount: 100 },
      reviewerUid: 'admin-1'
    })
    assert.equal(result.code, -1)

    const payConfigCall = calls.find((call) => call.collection === 'pay_config')
    assert.equal(payConfigCall.condition.storeId, 'store-a')
  } finally {
    restoreData()
    restoreContext()
    restoreStateMachine()
    unloadModule(refundPath)
  }
})
