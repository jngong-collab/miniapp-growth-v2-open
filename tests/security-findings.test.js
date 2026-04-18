const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('module')
const path = require('path')

const repoRoot = path.resolve(__dirname, '..')

// ─────────────────────────────────────────────
// Shared mocks for wx-server-sdk / cloudbase
// ─────────────────────────────────────────────
const dbCommand = {
  gte: (v) => ({ _op: 'gte', value: v }),
  in: (v) => ({ _op: 'in', value: v }),
  nin: (v) => ({ _op: 'nin', value: v }),
  neq: (v) => ({ _op: 'neq', value: v }),
  lte: (v) => ({ _op: 'lte', value: v }),
  gt: (v) => ({ _op: 'gt', value: v }),
  inc: (v) => ({ _op: 'inc', value: v }),
  push: (v) => ({ _op: 'push', value: v })
}

const mockWxSdk = {
  init: () => {},
  DYNAMIC_CURRENT_ENV: 'test-env',
  database: () => ({
    command: dbCommand,
    serverDate: () => new Date('2024-01-01T00:00:00Z'),
    collection: () => ({
      doc: () => ({
        get: async () => ({ data: null }),
        update: async () => ({ stats: { updated: 1 } }),
        remove: async () => ({ deleted: 1 })
      }),
      where: () => ({
        limit: () => ({ get: async () => ({ data: [] }) }),
        count: async () => ({ total: 0 }),
        get: async () => ({ data: [] }),
        orderBy: () => ({ skip: () => ({ limit: () => ({ get: async () => ({ data: [] }) }) }), limit: () => ({ get: async () => ({ data: [] }) }) }),
        skip: () => ({ limit: () => ({ get: async () => ({ data: [] }) }) })
      }),
      add: async () => ({ _id: 'test-doc-id' })
    })
  }),
  getWXContext: () => ({ OPENID: 'test-openid' })
}

const mockCloudbaseSdk = {
  init: () => ({
    auth: () => ({
      getUserInfo: () => ({ uid: 'test-uid', customUserId: 'test-uid' })
    })
  })
}

const originalRequire = Module.prototype.require
Module.prototype.require = function (id) {
  if (id === 'wx-server-sdk') return mockWxSdk
  if (id === '@cloudbase/node-sdk') return mockCloudbaseSdk
  return originalRequire.apply(this, arguments)
}

// ─────────────────────────────────────────────
// Finding 1: payApi wxpayNotify authentication
// ─────────────────────────────────────────────
test('payApi wxpayNotify rejects forged callbacks without internal secret', async () => {
  const internalAuthPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'payApi', 'internal-auth.js')
  const originalModule = require.cache[internalAuthPath]
  require.cache[internalAuthPath] = new Module(internalAuthPath, module)
  require.cache[internalAuthPath].exports = {
    getInternalSecret: () => 'secret',
    isAuthorizedInternalCall: () => false,
    resolveTrustedWxpayNotify: undefined
  }

  const payApi = require('../miniapp/cloudfunctions/payApi/index.js')
  const result = await payApi.main({
    action: 'wxpayNotify',
    outTradeNo: 'ORD202401010000001',
    transactionId: 'TXN123',
    resultCode: 'SUCCESS'
  })

  assert.equal(result.code, 403)
  assert.equal(result.msg, '无权访问')

  delete require.cache[internalAuthPath]
  if (originalModule) require.cache[internalAuthPath] = originalModule
  delete require.cache[path.join(repoRoot, 'miniapp', 'cloudfunctions', 'payApi', 'index.js')]
})

test('payApi wxpayNotify accepts callbacks with valid internal secret', async () => {
  const internalAuthPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'payApi', 'internal-auth.js')
  const originalModule = require.cache[internalAuthPath]
  require.cache[internalAuthPath] = new Module(internalAuthPath, module)
  require.cache[internalAuthPath].exports = {
    getInternalSecret: () => 'secret',
    isAuthorizedInternalCall: (event) => event && event._internalSecret === 'secret',
    resolveTrustedWxpayNotify: undefined
  }

  const payApi = require('../miniapp/cloudfunctions/payApi/index.js')
  const result = await payApi.main({
    action: 'wxpayNotify',
    _internalSecret: 'secret',
    outTradeNo: 'ORD202401010000001',
    transactionId: 'TXN123',
    resultCode: 'FAIL'
  })

  assert.equal(result.code, 0)

  delete require.cache[internalAuthPath]
  if (originalModule) require.cache[internalAuthPath] = originalModule
  delete require.cache[path.join(repoRoot, 'miniapp', 'cloudfunctions', 'payApi', 'index.js')]
})

// ─────────────────────────────────────────────
// Finding 2: shared/admin-access empty array escalation
// ─────────────────────────────────────────────
test('shared/admin-access does not escalate empty permissions to full admin', () => {
  const { normalizeAdminPermissions, ADMIN_WEB_PERMISSIONS } = require('../miniapp/cloudfunctions/shared/admin-access')

  assert.deepEqual(normalizeAdminPermissions([]), [])
  assert.deepEqual(normalizeAdminPermissions(undefined), ADMIN_WEB_PERMISSIONS)
  assert.deepEqual(normalizeAdminPermissions(null), ADMIN_WEB_PERMISSIONS)
  assert.deepEqual(normalizeAdminPermissions(['viewDashboard', 'viewDashboard']), ['viewDashboard'])
})

// ─────────────────────────────────────────────
// Finding 3: tmpDbFix unprotected destructive endpoint
// ─────────────────────────────────────────────
test('tmpDbFix stays disabled by default for unauthenticated calls', async () => {
  const internalAuthPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'payApi', 'internal-auth.js')
  const originalModule = require.cache[internalAuthPath]
  require.cache[internalAuthPath] = new Module(internalAuthPath, module)
  require.cache[internalAuthPath].exports = {
    getInternalSecret: () => 'secret',
    isAuthorizedInternalCall: (event) => event && event._internalSecret === 'secret'
  }

  const tmpDbFix = require('../miniapp/cloudfunctions/tmpDbFix/index.js')
  const result = await tmpDbFix.main({})

  assert.equal(result.code, 403)
  assert.equal(result.msg, 'tmpDbFix 未启用')

  delete require.cache[internalAuthPath]
  if (originalModule) require.cache[internalAuthPath] = originalModule
  delete require.cache[path.join(repoRoot, 'miniapp', 'cloudfunctions', 'tmpDbFix', 'index.js')]
})

test('tmpDbFix stays disabled by default even with a valid internal secret', async () => {
  const internalAuthPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'payApi', 'internal-auth.js')
  const originalModule = require.cache[internalAuthPath]
  require.cache[internalAuthPath] = new Module(internalAuthPath, module)
  require.cache[internalAuthPath].exports = {
    getInternalSecret: () => 'secret',
    isAuthorizedInternalCall: (event) => event && event._internalSecret === 'secret'
  }

  const tmpDbFix = require('../miniapp/cloudfunctions/tmpDbFix/index.js')
  const result = await tmpDbFix.main({ _internalSecret: 'secret' })

  assert.equal(result.code, 403)
  assert.equal(result.msg, 'tmpDbFix 未启用')

  delete require.cache[internalAuthPath]
  if (originalModule) require.cache[internalAuthPath] = originalModule
  delete require.cache[path.join(repoRoot, 'miniapp', 'cloudfunctions', 'tmpDbFix', 'index.js')]
})

// ─────────────────────────────────────────────
// Finding 4: workbench.js race with async login
// ─────────────────────────────────────────────
test('ensureWorkbenchAccess waits for role promise on cold start to avoid misclassifying staff as customer', async () => {
  // Isolate workbench module by clearing cache
  const workbenchPath = path.join(repoRoot, 'miniapp', 'utils', 'workbench.js')
  delete require.cache[workbenchPath]

  let navigateBackCalled = false
  let toastTitle = ''

  const appMock = {
    globalData: {
      role: 'customer',
      permissions: [],
      workbenchAccess: null,
      _rolePromise: Promise.resolve().then(() => {
        appMock.globalData.role = 'staff'
        appMock.globalData.permissions = ['verify']
      })
    }
  }
  global.getApp = () => appMock

  global.wx = {
    showToast: (opts) => { toastTitle = opts.title },
    navigateBack: () => { navigateBackCalled = true }
  }

  const { ensureWorkbenchAccess } = require(workbenchPath)

  const page = { setData: () => {} }
  const first = ensureWorkbenchAccess(page, { requiredPermission: 'verify' })
  assert.equal(first, null, 'should return null while waiting for role promise')

  // Wait for the promise chain to complete
  await new Promise(resolve => setTimeout(resolve, 10))

  // After promise resolves, calling again should grant access
  const second = ensureWorkbenchAccess(page, { requiredPermission: 'verify' })
  assert.ok(second)
  assert.equal(second.role, 'staff')
  assert.deepEqual(second.permissions, ['verify'])
  assert.equal(navigateBackCalled, false)
  assert.equal(toastTitle, '')

  delete require.cache[workbenchPath]
  delete global.getApp
  delete global.wx
})

// ─────────────────────────────────────────────
// Finding 5: modules-dashboard.js storeId isolation
// ─────────────────────────────────────────────
test('dashboard getOverview scopes all queries by storeId', async () => {
  const dashboardPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'modules-dashboard.js')
  delete require.cache[dashboardPath]

  const calls = []
  const dataPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'data.js')
  const originalDataModule = require.cache[dataPath]

  require.cache[dataPath] = new Module(dataPath, module)
  require.cache[dataPath].exports = {
    getAccessStoreId: (access) => access.account.storeId,
    safeList: async (collection, condition, options) => {
      calls.push({ type: 'safeList', collection, condition, options })
      if (collection === 'orders') return [{ _id: 'order-1', status: 'paid', createdAt: new Date() }]
      if (collection === 'users') return [{ _openid: 'user-1' }]
      if (collection === 'fission_campaigns') return [{ _id: 'camp-1', productName: '活动' }]
      return []
    },
    safeCount: async (collection, condition) => {
      calls.push({ type: 'safeCount', collection, condition })
      return 0
    },
    fetchOrdersMap: async () => ({ 'order-1': { _id: 'order-1', status: 'paid' } }),
    fetchUsersMap: async () => ({ 'user-1': { _openid: 'user-1' } }),
    _cmd: dbCommand
  }

  const { getOverview } = require(dashboardPath)
  const access = { account: { storeId: 'store-123' } }
  await getOverview(access)

  // Verify orders queries are scoped
  const ordersCalls = calls.filter(c => c.collection === 'orders')
  assert.ok(ordersCalls.length > 0, 'expected orders queries')
  for (const c of ordersCalls) {
    assert.equal(c.condition.storeId, 'store-123', `orders query missing storeId: ${JSON.stringify(c.condition)}`)
  }

  // Verify users query is scoped
  const usersCall = calls.find(c => c.collection === 'users')
  assert.ok(usersCall, 'expected users query')
  assert.equal(usersCall.condition.storeId, 'store-123')

  // Verify fission_campaigns query is scoped
  const campaignsCall = calls.find(c => c.collection === 'fission_campaigns')
  assert.ok(campaignsCall, 'expected fission_campaigns query')
  assert.equal(campaignsCall.condition.storeId, 'store-123')

  // Verify order_items uses orderId IN instead of global scan
  const itemsCalls = calls.filter(c => c.collection === 'order_items')
  assert.ok(itemsCalls.length > 0, 'expected order_items queries')
  for (const c of itemsCalls) {
    assert.ok(c.condition.orderId, 'order_items should be filtered by orderId')
  }

  // Verify refund_requests uses orderId IN
  const refundCalls = calls.filter(c => c.collection === 'refund_requests')
  assert.ok(refundCalls.length > 0, 'expected refund_requests queries')
  for (const c of refundCalls) {
    assert.ok(c.condition.orderId, 'refund_requests should be filtered by orderId')
  }

  delete require.cache[dataPath]
  if (originalDataModule) require.cache[dataPath] = originalDataModule
  delete require.cache[dashboardPath]
})

test('dashboard getTrends scopes orders and lead collections by storeId', async () => {
  const dashboardPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'modules-dashboard.js')
  delete require.cache[dashboardPath]

  const calls = []
  const dataPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'data.js')
  const originalDataModule = require.cache[dataPath]

  require.cache[dataPath] = new Module(dataPath, module)
  require.cache[dataPath].exports = {
    getAccessStoreId: (access) => access.account.storeId,
    safeList: async (collection, condition, options) => {
      calls.push({ type: 'safeList', collection, condition, options })
      if (collection === 'orders') return [{ _id: 'order-1', status: 'paid', createdAt: new Date() }]
      if (collection === 'users') return [{ _openid: 'user-1' }]
      if (collection === 'fission_campaigns') return [{ _id: 'camp-1', productName: '活动' }]
      return []
    },
    safeCount: async () => 0,
    fetchOrdersMap: async () => ({ 'order-1': { _id: 'order-1', status: 'paid' } }),
    fetchUsersMap: async () => ({ 'user-1': { _openid: 'user-1' } }),
    _cmd: dbCommand
  }

  const { getTrends } = require(dashboardPath)
  const access = { account: { storeId: 'store-456' } }
  await getTrends(access, { range: '7d' })

  const ordersCall = calls.find(c => c.collection === 'orders')
  assert.ok(ordersCall)
  assert.equal(ordersCall.condition.storeId, 'store-456')

  const tongueCall = calls.find(c => c.collection === 'tongue_reports')
  assert.ok(tongueCall)
  assert.ok(tongueCall.condition._openid, 'tongue_reports should be scoped by user openids')

  const lotteryCall = calls.find(c => c.collection === 'lottery_records')
  assert.ok(lotteryCall)
  assert.ok(lotteryCall.condition._openid, 'lottery_records should be scoped by user openids')

  const fissionCall = calls.find(c => c.collection === 'fission_records')
  assert.ok(fissionCall)
  assert.ok(fissionCall.condition.campaignId, 'fission_records should be scoped by campaignIds')

  delete require.cache[dataPath]
  if (originalDataModule) require.cache[dataPath] = originalDataModule
  delete require.cache[dashboardPath]
})

test('catalog listPackages scopes package queries to the current store and hydrates legacy bindings', async () => {
  const catalogPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'modules-catalog.js')
  delete require.cache[catalogPath]

  const calls = []
  const dataPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'data.js')
  const originalDataModule = require.cache[dataPath]

  require.cache[dataPath] = new Module(dataPath, module)
  require.cache[dataPath].exports = {
    getAccessStoreId: (access) => access.account.storeId,
    safeGetById: async () => null,
    safeList: async (collection, condition, options) => {
      calls.push({ type: 'safeList', collection, condition, options })
      if (collection === 'products') {
        if (condition.type === 'package') {
          return [{ _id: 'prod-1', name: '测试套餐商品', type: 'package', storeId: 'store-789' }]
        }
        return [{ _id: 'legacy-1', name: '历史套餐商品', type: 'service', storeId: 'store-789' }]
      }
      if (collection === 'packages') {
        return [{ _id: 'pkg-legacy', productId: 'legacy-1', storeId: 'store-789', items: [{ name: '推拿', count: 1 }] }]
      }
      return []
    },
    writeAuditLog: async () => null,
    db: { serverDate: () => new Date() }
  }

  // Need _cmd for modules-catalog
  const contextPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'context.js')
  const originalContextModule = require.cache[contextPath]
  require.cache[contextPath] = new Module(contextPath, module)
  require.cache[contextPath].exports = {
    db: { serverDate: () => new Date() },
    _cmd: dbCommand
  }

  const { listPackages } = require(catalogPath)
  const access = { account: { storeId: 'store-789' } }
  await listPackages(access)

  const productsCall = calls.find(c => c.collection === 'products')
  assert.ok(productsCall)
  assert.equal(productsCall.condition.storeId, 'store-789')
  assert.equal(productsCall.condition.type, 'package')

  const packagesCall = calls.find(c => c.collection === 'packages')
  assert.ok(packagesCall)
  assert.equal(packagesCall.condition.storeId, 'store-789')

  const legacyProductsCall = calls.find(c => c.collection === 'products' && c.condition && c.condition._id)
  assert.ok(legacyProductsCall, 'legacy package bindings should fetch referenced store products')

  delete require.cache[dataPath]
  if (originalDataModule) require.cache[dataPath] = originalDataModule
  delete require.cache[contextPath]
  if (originalContextModule) require.cache[contextPath] = originalContextModule
  delete require.cache[catalogPath]
})

test('catalog savePackage writes storeId and validates product ownership', async () => {
  const catalogPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'modules-catalog.js')
  delete require.cache[catalogPath]

  let addPayload = null
  const dataPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'data.js')
  const originalDataModule = require.cache[dataPath]

  require.cache[dataPath] = new Module(dataPath, module)
  require.cache[dataPath].exports = {
    getAccessStoreId: (access) => access.account.storeId,
    safeGetById: async (collection, id) => {
      if (collection === 'products' && id === 'prod-owned') {
        return { _id: 'prod-owned', name: ' owned', type: 'package', storeId: 'store-abc' }
      }
      if (collection === 'products' && id === 'prod-other') {
        return { _id: 'prod-other', name: ' other', storeId: 'store-other' }
      }
      return null
    },
    safeList: async () => [],
    writeAuditLog: async () => null,
    db: {
      serverDate: () => new Date(),
      collection: () => ({
        add: async ({ data }) => {
          addPayload = data
          return { _id: 'pkg-1' }
        },
        doc: () => ({ update: async () => ({}), get: async () => ({ data: null }) })
      })
    }
  }

  const contextPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'context.js')
  const originalContextModule = require.cache[contextPath]
  require.cache[contextPath] = new Module(contextPath, module)
  require.cache[contextPath].exports = {
    db: {
      serverDate: () => new Date(),
      collection: () => ({
        add: async ({ data }) => {
          addPayload = data
          return { _id: 'pkg-1' }
        },
        doc: () => ({ update: async () => ({}), get: async () => ({ data: null }) })
      })
    },
    _cmd: dbCommand
  }

  const { savePackage } = require(catalogPath)

  // Reject cross-store product
  const rejectRes = await savePackage({ account: { storeId: 'store-abc' } }, { payload: { name: '跨店套餐', productId: 'prod-other', items: [{ name: 'A', count: 1 }] } })
  assert.equal(rejectRes.code, -1)
  assert.ok(rejectRes.msg.includes('无权限'))

  // Accept same-store product and include storeId
  const acceptRes = await savePackage({ account: { storeId: 'store-abc' } }, { payload: { name: '同店套餐', productId: 'prod-owned', items: [{ name: 'A', count: 1 }] } })
  assert.equal(acceptRes.code, 0)
  assert.equal(addPayload.storeId, 'store-abc')

  delete require.cache[dataPath]
  if (originalDataModule) require.cache[dataPath] = originalDataModule
  delete require.cache[contextPath]
  if (originalContextModule) require.cache[contextPath] = originalContextModule
  delete require.cache[catalogPath]
})
