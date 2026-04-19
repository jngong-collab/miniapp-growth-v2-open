const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..')
const appPath = path.join(repoRoot, 'miniapp', 'app.js')
const workbenchPath = path.join(repoRoot, 'miniapp', 'utils', 'workbench.js')
const opsApiPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'opsApi', 'index.js')

function flush(ms = 30) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function clearModuleCache(modulePath) {
  delete require.cache[modulePath]
}

function withPatchedRequire(mappings, loader) {
  const originalRequire = Module.prototype.require
  Module.prototype.require = function patchedRequire(id) {
    if (Object.prototype.hasOwnProperty.call(mappings, id)) {
      return mappings[id]
    }
    return originalRequire.apply(this, arguments)
  }

  try {
    return loader()
  } finally {
    Module.prototype.require = originalRequire
  }
}

function loadApp(callCloudImpl) {
  clearModuleCache(appPath)

  let appDefinition = null
  global.App = (config) => {
    appDefinition = config
  }
  global.wx = {
    cloud: {
      init: () => {}
    }
  }

  withPatchedRequire({
    './utils/cloud-api': { callCloud: callCloudImpl }
  }, () => {
    require(appPath)
  })

  return {
    app: appDefinition,
    cleanup() {
      clearModuleCache(appPath)
      delete global.App
      delete global.wx
    }
  }
}

function loadWorkbench(appMock, wxMock) {
  clearModuleCache(workbenchPath)
  global.getApp = () => appMock
  global.wx = wxMock
  return require(workbenchPath)
}

function cleanupWorkbench() {
  clearModuleCache(workbenchPath)
  delete global.getApp
  delete global.wx
}

function getValuesByPath(value, parts) {
  if (!parts.length) return [value]
  if (Array.isArray(value)) {
    return value.flatMap(item => getValuesByPath(item, parts))
  }
  if (value === null || value === undefined) return [undefined]
  const [head, ...rest] = parts
  return getValuesByPath(value[head], rest)
}

function matchesExpected(actual, expected) {
  if (expected && typeof expected === 'object' && expected._op) {
    switch (expected._op) {
      case 'in':
        return Array.isArray(actual)
          ? actual.some(item => expected.value.includes(item))
          : expected.value.includes(actual)
      case 'neq':
        return Array.isArray(actual)
          ? actual.every(item => item !== expected.value)
          : actual !== expected.value
      case 'gt':
        return Number(actual || 0) > Number(expected.value)
      case 'gte':
        return actual >= expected.value
      case 'lte':
        return actual <= expected.value
      case 'inc':
      case 'push':
        return false
      default:
        return false
    }
  }

  if (Array.isArray(actual)) {
    return actual.includes(expected)
  }
  return actual === expected
}

function matchesCondition(doc, condition = {}) {
  return Object.entries(condition).every(([key, expected]) => {
    const values = getValuesByPath(doc, key.split('.'))
    return values.some(value => matchesExpected(value, expected))
  })
}

function getByPath(target, pathKey) {
  return pathKey.split('.').reduce((acc, key) => (acc === null || acc === undefined ? undefined : acc[key]), target)
}

function setByPath(target, pathKey, value) {
  const parts = pathKey.split('.')
  let cursor = target
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i]
    if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {}
    cursor = cursor[key]
  }
  cursor[parts[parts.length - 1]] = value
}

function applyUpdate(doc, data) {
  Object.entries(data || {}).forEach(([key, value]) => {
    if (value && typeof value === 'object' && value._op === 'inc') {
      setByPath(doc, key, Number(getByPath(doc, key) || 0) + Number(value.value || 0))
      return
    }
    if (value && typeof value === 'object' && value._op === 'push') {
      const current = getByPath(doc, key)
      const next = Array.isArray(current) ? current.slice() : []
      next.push(clone(value.value))
      setByPath(doc, key, next)
      return
    }
    setByPath(doc, key, clone(value))
  })
}

function createCollectionApi(state, name, command) {
  const docs = state[name] || (state[name] = [])
  let condition = {}
  let limitValue = 20
  let skipValue = 0
  let orderByRule = null

  const query = {
    where(nextCondition = {}) {
      condition = nextCondition
      return query
    },
    limit(nextLimit) {
      limitValue = nextLimit
      return query
    },
    skip(nextSkip) {
      skipValue = nextSkip
      return query
    },
    orderBy(field, direction) {
      orderByRule = { field, direction }
      return query
    },
    async get() {
      let result = docs.filter(item => matchesCondition(item, condition))
      if (orderByRule) {
        result = result.slice().sort((a, b) => {
          const left = getByPath(a, orderByRule.field)
          const right = getByPath(b, orderByRule.field)
          if (left === right) return 0
          const compare = left > right ? 1 : -1
          return orderByRule.direction === 'desc' ? -compare : compare
        })
      }
      result = result.slice(skipValue, skipValue + limitValue)
      return { data: clone(result) }
    },
    async count() {
      return { total: docs.filter(item => matchesCondition(item, condition)).length }
    },
    async update({ data }) {
      let updated = 0
      docs.forEach(item => {
        if (!matchesCondition(item, condition)) return
        applyUpdate(item, data)
        updated += 1
      })
      return { stats: { updated } }
    }
  }

  return {
    ...query,
    doc(id) {
      return {
        async get() {
          const item = docs.find(entry => entry._id === id) || null
          return { data: item ? clone(item) : null }
        },
        async update({ data }) {
          const item = docs.find(entry => entry._id === id)
          if (!item) return { stats: { updated: 0 } }
          applyUpdate(item, data)
          return { stats: { updated: 1 } }
        },
        async remove() {
          const index = docs.findIndex(entry => entry._id === id)
          if (index < 0) return { stats: { removed: 0 } }
          docs.splice(index, 1)
          return { stats: { removed: 1 } }
        }
      }
    },
    async add({ data }) {
      const record = clone(data)
      if (!record._id) {
        record._id = `${name}-${docs.length + 1}`
      }
      docs.push(record)
      return { _id: record._id }
    }
  }
}

function createFakeCloud(initialState, openid) {
  const state = clone(initialState)
  const command = {
    in: value => ({ _op: 'in', value }),
    neq: value => ({ _op: 'neq', value }),
    gt: value => ({ _op: 'gt', value }),
    gte: value => ({ _op: 'gte', value }),
    lte: value => ({ _op: 'lte', value }),
    inc: value => ({ _op: 'inc', value }),
    push: value => ({ _op: 'push', value })
  }

  const database = {
    command,
    serverDate: () => 'SERVER_DATE',
    collection(name) {
      return createCollectionApi(state, name, command)
    },
    async runTransaction(handler) {
      return handler({
        collection(name) {
          return database.collection(name)
        }
      })
    }
  }

  return {
    state,
    cloud: {
      init: () => {},
      DYNAMIC_CURRENT_ENV: 'test-env',
      database: () => database,
      getWXContext: () => ({ OPENID: openid }),
      cloudPay: {
        refund: async () => ({
          returnCode: 'SUCCESS',
          resultCode: 'SUCCESS'
        })
      }
    }
  }
}

function loadOpsApi(initialState, openid = 'admin-a') {
  clearModuleCache(opsApiPath)
  const fakeCloud = createFakeCloud(initialState, openid)
  const opsApi = withPatchedRequire({
    'wx-server-sdk': fakeCloud.cloud
  }, () => require(opsApiPath))

  return {
    opsApi,
    state: fakeCloud.state,
    cleanup() {
      clearModuleCache(opsApiPath)
    }
  }
}

test('ensureWorkbenchAccess waits for cold-start staff role before granting access', async () => {
  const appMock = {
    globalData: {
      role: 'customer',
      permissions: [],
      workbenchAccess: null,
      _roleReady: false
    }
  }
  const pageSnapshots = []
  let toastCount = 0
  let navigateCount = 0
  const { ensureWorkbenchAccess } = loadWorkbench(appMock, {
    showToast: () => { toastCount += 1 },
    navigateBack: () => { navigateCount += 1 }
  })

  const access = ensureWorkbenchAccess({
    setData(data) {
      pageSnapshots.push(data)
    }
  }, { requiredPermission: 'verify' })

  assert.equal(access, null)
  assert.equal(toastCount, 0)
  assert.equal(navigateCount, 0)

  appMock.globalData.role = 'staff'
  appMock.globalData.permissions = ['verify']
  appMock.globalData.workbenchAccess = { staffName: '小李' }
  appMock.globalData._roleReady = true

  await flush()

  assert.equal(toastCount, 0)
  assert.equal(navigateCount, 0)
  assert.deepEqual(pageSnapshots.at(-1), {
    role: 'staff',
    permissions: ['verify'],
    workbenchStaffName: '小李'
  })

  cleanupWorkbench()
})

test('ensureWorkbenchAccess waits for role readiness and rejects customer after role load completes', async () => {
  const appMock = {
    globalData: {
      role: 'customer',
      permissions: [],
      workbenchAccess: null,
      _roleReady: false
    }
  }
  let toastTitle = ''
  let navigateCount = 0
  const { ensureWorkbenchAccess } = loadWorkbench(appMock, {
    showToast: (options) => { toastTitle = options.title },
    navigateBack: () => { navigateCount += 1 }
  })

  const access = ensureWorkbenchAccess(null, { requiredPermission: 'verify' })
  assert.equal(access, null)
  assert.equal(toastTitle, '')
  assert.equal(navigateCount, 0)

  appMock.globalData._roleReady = true
  await flush(260)

  assert.equal(toastTitle, '暂无工作台权限')
  assert.equal(navigateCount, 1)

  cleanupWorkbench()
})

test('setInviter transient failure does not downgrade an already logged-in staff user to customer', async () => {
  let loginCount = 0
  const { app, cleanup } = loadApp(async (_name, payload) => {
    if (payload.action === 'ensureUser') {
      loginCount += 1
      if (loginCount === 1) {
        return {
          openid: 'staff-openid',
          data: { _openid: 'staff-openid', nickName: '员工' }
        }
      }
      throw new Error('bind inviter failed')
    }
    if (payload.action === 'getWorkbenchAccess') {
      return {
        code: 0,
        data: {
          role: 'staff',
          permissions: ['verify'],
          staffName: '小李'
        }
      }
    }
    throw new Error(`unexpected action: ${payload.action}`)
  })

  app.globalData.config = { inviteBindRule: 'first' }
  app._login()
  await flush()

  assert.equal(app.globalData.openid, 'staff-openid')
  assert.equal(app.globalData.role, 'staff')
  assert.deepEqual(app.globalData.permissions, ['verify'])

  app.setInviter('inviter-openid')
  await flush()

  assert.equal(app.globalData.openid, 'staff-openid')
  assert.equal(app.globalData.role, 'staff')
  assert.deepEqual(app.globalData.permissions, ['verify'])

  cleanup()
})

test('opsApi ensureUser binds a new customer to the inviter store instead of the first store', async () => {
  const { opsApi, state, cleanup } = loadOpsApi({
    stores: [
      { _id: 'store-a', name: 'A 店', adminOpenids: ['admin-a'], staff: [] },
      { _id: 'store-b', name: 'B 店', adminOpenids: ['admin-b'], staff: [] }
    ],
    users: [
      { _id: 'user-inviter', _openid: 'inviter-b', storeId: 'store-b', role: 'customer', permissions: [] }
    ]
  }, 'new-customer')

  const result = await opsApi.main({ action: 'ensureUser', invitedBy: 'inviter-b' })

  assert.equal(result.code, 0)
  assert.equal(result.data.storeId, 'store-b')
  assert.equal(state.users.find(item => item._openid === 'new-customer').storeId, 'store-b')

  cleanup()
})

test('opsApi ensureUser backfills missing storeId from the sole active admin account store', async () => {
  const { opsApi, state, cleanup } = loadOpsApi({
    stores: [
      { _id: 'store-a', name: 'A 店', adminOpenids: [], staff: [] },
      { _id: 'store-b', name: 'B 店', adminOpenids: [], staff: [] }
    ],
    admin_accounts: [
      { _id: 'admin-1', uid: 'owner-1', status: 'active', storeId: 'store-b', role: 'owner' }
    ],
    users: [
      { _id: 'user-legacy', _openid: 'legacy-customer', role: 'customer', permissions: [], memberLevel: 'normal' }
    ]
  }, 'legacy-customer')

  const result = await opsApi.main({ action: 'ensureUser' })

  assert.equal(result.code, 0)
  assert.equal(result.data.storeId, 'store-b')
  assert.equal(state.users.find(item => item._openid === 'legacy-customer').storeId, 'store-b')

  cleanup()
})

test('opsApi getStoreInfo returns the current user store instead of the first store in multi-store mode', async () => {
  const { opsApi, cleanup } = loadOpsApi({
    stores: [
      { _id: 'store-a', name: 'A 店', adminOpenids: ['admin-a'], staff: [] },
      { _id: 'store-b', name: 'B 店', adminOpenids: ['admin-b'], staff: [] }
    ],
    users: [
      { _id: 'user-b', _openid: 'customer-b', storeId: 'store-b', role: 'customer', permissions: [] }
    ]
  }, 'customer-b')

  const result = await opsApi.main({ action: 'getStoreInfo' })

  assert.equal(result.code, 0)
  assert.equal(result.data._id, 'store-b')
  assert.equal(result.data.name, 'B 店')

  cleanup()
})

test('opsApi getWorkbenchOrders only returns same-store orders', async () => {
  const { opsApi, cleanup } = loadOpsApi({
    stores: [
      { _id: 'store-a', name: 'A 店', adminOpenids: ['admin-a'], staff: [] }
    ],
    users: [
      { _id: 'user-a', _openid: 'lead-a', storeId: 'store-a', nickName: 'A 客户' },
      { _id: 'user-b', _openid: 'lead-b', storeId: 'store-b', nickName: 'B 客户' }
    ],
    orders: [
      { _id: 'order-a', _openid: 'lead-a', orderNo: 'A001', status: 'paid', storeId: 'store-a', createdAt: 2 },
      { _id: 'order-b', _openid: 'lead-b', orderNo: 'B001', status: 'paid', storeId: 'store-b', createdAt: 1 }
    ],
    refund_requests: [
      { _id: 'refund-a', orderId: 'order-a', status: 'pending', updatedAt: 2 },
      { _id: 'refund-b', orderId: 'order-b', status: 'pending', updatedAt: 1 }
    ]
  })

  const result = await opsApi.main({ action: 'getWorkbenchOrders', status: 'all' })

  assert.equal(result.code, 0)
  assert.deepEqual(result.data.map(item => item._id), ['order-a'])
  assert.equal(result.data[0].refundRequest._id, 'refund-a')

  cleanup()
})

test('opsApi getLeadList only aggregates leads from the current store', async () => {
  const { opsApi, cleanup } = loadOpsApi({
    stores: [
      { _id: 'store-a', name: 'A 店', adminOpenids: ['admin-a'], staff: [] }
    ],
    users: [
      { _id: 'user-a', _openid: 'lead-a', storeId: 'store-a', nickName: 'A 客户' },
      { _id: 'user-b', _openid: 'lead-b', storeId: 'store-b', nickName: 'B 客户' }
    ],
    fission_campaigns: [
      { _id: 'camp-a', storeId: 'store-a' },
      { _id: 'camp-b', storeId: 'store-b' }
    ],
    tongue_reports: [
      { _id: 'tongue-a', _openid: 'lead-a', createdAt: 2 },
      { _id: 'tongue-b', _openid: 'lead-b', createdAt: 1 }
    ],
    lottery_records: [],
    orders: [
      { _id: 'order-a', _openid: 'lead-a', storeId: 'store-a', status: 'paid', createdAt: 3 },
      { _id: 'order-b', _openid: 'lead-b', storeId: 'store-b', status: 'paid', createdAt: 4 }
    ],
    fission_records: [
      { _id: 'fission-a', campaignId: 'camp-a', inviteeOpenid: 'lead-a', createdAt: 5 },
      { _id: 'fission-b', campaignId: 'camp-b', inviteeOpenid: 'lead-b', createdAt: 6 }
    ],
    customer_followups: [
      { _id: 'followup-a', leadOpenid: 'lead-a', status: 'contacted', note: 'A 跟进', updatedAt: 7 },
      { _id: 'followup-b', leadOpenid: 'lead-b', status: 'visited', note: 'B 跟进', updatedAt: 8 }
    ]
  })

  const result = await opsApi.main({ action: 'getLeadList', source: 'all' })

  assert.equal(result.code, 0)
  assert.deepEqual(result.data.map(item => item._openid), ['lead-a'])
  assert.equal(result.data[0].followupNote, 'A 跟进')

  cleanup()
})

test('opsApi queryVerifyCode fails closed when the verification item belongs to another store', async () => {
  const { opsApi, cleanup } = loadOpsApi({
    stores: [
      { _id: 'store-a', name: 'A 店', adminOpenids: ['admin-a'], staff: [] }
    ],
    orders: [
      { _id: 'order-foreign', status: 'paid', storeId: '' }
    ],
    order_items: [
      {
        _id: 'item-foreign',
        _openid: 'lead-b',
        orderId: 'order-foreign',
        verifyCode: 'VC-001',
        productType: 'service',
        productName: '单次推拿',
        storeId: 'store-b'
      }
    ]
  })

  const result = await opsApi.main({ action: 'queryVerifyCode', verifyCode: 'VC-001' })

  assert.equal(result.code, 403)

  cleanup()
})

test('opsApi verifyPackage fails closed when the verification item belongs to another store', async () => {
  const { opsApi, cleanup } = loadOpsApi({
    stores: [
      { _id: 'store-a', name: 'A 店', adminOpenids: ['admin-a'], staff: [] }
    ],
    orders: [
      { _id: 'order-foreign', status: 'paid', storeId: '' }
    ],
    order_items: [
      {
        _id: 'item-foreign',
        _openid: 'lead-b',
        orderId: 'order-foreign',
        verifyCode: 'VC-002',
        productType: 'service',
        productName: '单次推拿',
        packageRemaining: {},
        storeId: 'store-b'
      }
    ],
    package_usage: []
  })

  const result = await opsApi.main({ action: 'verifyPackage', verifyCode: 'VC-002' })

  assert.equal(result.code, 403)

  cleanup()
})

test('opsApi updateRefundRequest rejects requests owned by another store when the order storeId is missing', async () => {
  const { opsApi, cleanup } = loadOpsApi({
    stores: [
      { _id: 'store-a', name: 'A 店', adminOpenids: ['admin-a'], staff: [] }
    ],
    orders: [
      { _id: 'order-foreign', orderNo: 'ORD-FOREIGN', status: 'refund_requested', storeId: '' }
    ],
    refund_requests: [
      {
        _id: 'request-foreign',
        orderId: 'order-foreign',
        status: 'pending',
        previousStatus: 'paid',
        storeId: 'store-b'
      }
    ]
  })

  const result = await opsApi.main({
    action: 'updateRefundRequest',
    requestId: 'request-foreign',
    orderId: 'order-foreign',
    status: 'rejected'
  })

  assert.equal(result.code, 403)

  cleanup()
})

test('opsApi addStaff and updateStaffPermissions filter unknown permission keys', async () => {
  const { opsApi, state, cleanup } = loadOpsApi({
    stores: [
      { _id: 'store-a', name: 'A 店', adminOpenids: ['admin-a'], staff: [] }
    ]
  })

  const addResult = await opsApi.main({
    action: 'addStaff',
    staffOpenid: 'staff-1',
    staffName: '新员工',
    permissions: ['verify', 'viewOrders', 'not-defined']
  })

  assert.equal(addResult.code, 0)
  assert.deepEqual(state.stores[0].staff[0].permissions, ['verify', 'viewOrders', 'viewDashboard', 'viewLeads'])

  const updateResult = await opsApi.main({
    action: 'updateStaffPermissions',
    staffOpenid: 'staff-1',
    permissions: ['manageSettings', 'viewLeads', 'totally-unknown']
  })

  assert.equal(updateResult.code, 0)
  assert.deepEqual(state.stores[0].staff[0].permissions, ['verify', 'viewOrders', 'viewDashboard', 'viewLeads', 'manageSettings'])

  cleanup()
})
