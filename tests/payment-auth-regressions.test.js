const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('module')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..')

function loadFreshModule(modulePath, mocks = {}) {
  const resolvedPath = require.resolve(modulePath)
  const originalRequire = Module.prototype.require

  Module.prototype.require = function patchedRequire(id) {
    if (Object.prototype.hasOwnProperty.call(mocks, id)) {
      return mocks[id]
    }
    return originalRequire.apply(this, arguments)
  }

  delete require.cache[resolvedPath]

  try {
    return require(modulePath)
  } finally {
    Module.prototype.require = originalRequire
  }
}

function createPayApiWxSdk({ openid = '', orders = [], campaign = null, simulateConcurrentLimitRace = false } = {}) {
  const dbCommand = {
    neq: (value) => ({ op: 'neq', value }),
    gte: (value) => ({ op: 'gte', value }),
    inc: (value) => ({ op: 'inc', value })
  }
  const orderItems = []
  let pendingRaceReads = []
  let transactionQueue = Promise.resolve()

  function matchesQuery(row, query) {
    if (query._openid && row._openid !== query._openid) return false
    if (query.fissionCampaignId && row.fissionCampaignId !== query.fissionCampaignId) return false
    if (query.orderNo && row.orderNo !== query.orderNo) return false
    if (query.status && query.status.op === 'neq' && row.status === query.status.value) return false
    return true
  }

  function setDocument(store, docId, data) {
    const index = store.findIndex(item => item._id === docId)
    const row = { _id: docId, ...data }
    if (index >= 0) {
      store[index] = row
    } else {
      store.push(row)
    }
    return row
  }

  function createOrdersCollection({ withinTransaction = false } = {}) {
    return {
      where(query) {
        const matched = orders.filter(row => matchesQuery(row, query))
        let currentOffset = 0
        let currentLimit = 100

        const chain = {
          skip(n) {
            currentOffset = n
            return chain
          },
          limit(n) {
            currentLimit = n
            return chain
          },
          async get() {
            const result = matched.slice(currentOffset, currentOffset + currentLimit)
            const shouldSimulateRace =
              simulateConcurrentLimitRace &&
              !withinTransaction &&
              query &&
              query._openid &&
              query.fissionCampaignId &&
              query.status &&
              query.status.op === 'neq'

            if (!shouldSimulateRace) {
              return { data: result }
            }

            return await new Promise(resolve => {
              pendingRaceReads.push({ resolve, result })
              if (pendingRaceReads.length >= 2) {
                const batch = pendingRaceReads.splice(0, 2)
                batch.forEach(item => item.resolve({ data: item.result }))
              }
            })
          }
        }
        return chain
      },
      doc(docId) {
        return {
          where() {
            return {
              async update() {
                return { stats: { updated: 1 } }
              }
            }
          },
          async get() {
            return { data: orders.find(item => item._id === docId) || null }
          },
          async set({ data }) {
            const row = setDocument(orders, docId, data)
            return { _id: row._id }
          },
          async update({ data }) {
            const index = orders.findIndex(item => item._id === docId)
            if (index >= 0) {
              orders[index] = { ...orders[index], ...data }
            }
            return { stats: { updated: index >= 0 ? 1 : 0 } }
          }
        }
      },
      async add({ data }) {
        const row = { _id: `order-${Math.random().toString(36).slice(2, 9)}`, ...data }
        orders.push(row)
        return { _id: row._id }
      }
    }
  }

  function createOrderItemsCollection() {
    return {
      where() {
        return {
          async get() {
            return { data: [] }
          }
        }
      },
      doc(docId) {
        return {
          async set({ data }) {
            const row = setDocument(orderItems, docId, data)
            return { _id: row._id }
          }
        }
      },
      async add({ data }) {
        const row = { _id: `item-${Math.random().toString(36).slice(2, 9)}`, ...data }
        orderItems.push(row)
        return { _id: row._id }
      }
    }
  }

  const ordersCollection = createOrdersCollection()
  const orderItemsCollection = createOrderItemsCollection()

  const databaseApi = {
    command: dbCommand,
    serverDate: () => new Date('2026-04-15T00:00:00Z'),
    collection(name) {
      if (name === 'orders') return ordersCollection
      if (name === 'order_items') return orderItemsCollection
      if (name === 'products') return productsCollection
      if (name === 'fission_campaigns') {
        return {
          doc() {
            return {
              async get() {
                return { data: campaign }
              }
            }
          }
        }
      }
      return {
        limit(n) {
          return {
            async get() {
              return { data: [] }
            }
          }
        },
        where() {
          return {
            limit() {
              return {
                async get() {
                  return { data: [] }
                }
              }
            },
            async get() {
              return { data: [] }
            }
          }
        },
        doc() {
          return {
            async get() {
              return { data: null }
            },
            async update() {
              return { stats: { updated: 1 } }
            }
          }
        },
        async add({ data }) {
          return { _id: `doc-${Math.random().toString(36).slice(2, 9)}` }
        }
      }
    },
    async runTransaction(callback) {
      const previous = transactionQueue
      let release
      transactionQueue = new Promise(resolve => {
        release = resolve
      })
      await previous
      try {
        return await callback({
          collection(name) {
            if (name === 'orders') return createOrdersCollection({ withinTransaction: true })
            if (name === 'order_items') return createOrderItemsCollection()
            return databaseApi.collection(name)
          }
        })
      } finally {
        release()
      }
    }
  }

  const productsCollection = {
    doc() {
      return {
        async get() {
          return { data: { stock: -1, status: 'on', name: '测试商品', type: 'service' } }
        },
        async update() {
          return { stats: { updated: 1 } }
        }
      }
    }
  }

  return {
    init: () => {},
    DYNAMIC_CURRENT_ENV: 'test-env',
    database: () => databaseApi,
    getWXContext: () => ({ OPENID: openid })
  }
}

function createTmpDbFixWxSdk() {
  const products = []
  const packages = []
  let nextId = 1

  function makeCollection(store, name) {
    return {
      where(query = {}) {
        const rows = store.filter(item => {
          if (query.name && typeof query.name === 'string') {
            return item.name === query.name
          }
          if (query.productId) {
            return item.productId === query.productId
          }
          return false
        })

        return {
          limit() {
            return {
              async get() {
                return { data: rows.slice(0, 1) }
              }
            }
          },
          async get() {
            return { data: rows }
          }
        }
      },
      async add({ data }) {
        const row = { _id: `${name}-${nextId++}`, ...data }
        store.push(row)
        return { _id: row._id }
      },
      doc(docId) {
        return {
          async update({ data }) {
            const index = store.findIndex(item => item._id === docId)
            if (index >= 0) {
              store[index] = { ...store[index], ...data }
            }
            return { stats: { updated: index >= 0 ? 1 : 0 } }
          },
          async remove() {
            const index = store.findIndex(item => item._id === docId)
            if (index >= 0) {
              store.splice(index, 1)
            }
            return { stats: { removed: index >= 0 ? 1 : 0 } }
          }
        }
      }
    }
  }

  return {
    init: () => {},
    DYNAMIC_CURRENT_ENV: 'test-env',
    database: () => ({
      command: {
        nin: (values) => ({ op: 'nin', values })
      },
      serverDate: () => new Date('2026-04-15T00:00:00Z'),
      collection(name) {
        if (name === 'products') return makeCollection(products, 'product')
        if (name === 'packages') return makeCollection(packages, 'package')
        throw new Error(`unexpected collection: ${name}`)
      }
    }),
    getWXContext: () => ({ OPENID: '' })
  }
}

test('wxpayNotify accepts a platform-style callback without _internalSecret when no caller OPENID is present', async () => {
  const payApi = loadFreshModule('../miniapp/cloudfunctions/payApi/index.js', {
    'wx-server-sdk': createPayApiWxSdk({
      openid: '',
      orders: [{
        _id: 'order-1',
        _openid: 'user-openid',
        orderNo: 'ORD-PAID-1',
        quantity: 1,
        productId: 'product-1',
        status: 'pending'
      }]
    })
  })

  const result = await payApi.main({
    action: 'wxpayNotify',
    outTradeNo: 'ORD-PAID-1',
    transactionId: 'WX-TXN-1',
    resultCode: 'SUCCESS'
  })

  assert.equal(result.code, 0)
  assert.equal(result.msg, '支付处理完成')
})

test('wxpayNotify rejects a forged client call without internal authorization when caller OPENID is present', async () => {
  const payApi = loadFreshModule('../miniapp/cloudfunctions/payApi/index.js', {
    'wx-server-sdk': createPayApiWxSdk({ openid: 'client-openid' })
  })

  const result = await payApi.main({
    action: 'wxpayNotify',
    outTradeNo: 'ORD-FORGED-1',
    transactionId: 'WX-TXN-FORGED',
    resultCode: 'SUCCESS'
  })

  assert.equal(result.code, 403)
  assert.equal(result.msg, '无权访问')
})

test('normalizeAdminPermissions preserves explicit empty permissions, defaults nullish values, and drops unknown keys', () => {
  const {
    ADMIN_WEB_PERMISSIONS,
    normalizeAdminPermissions
  } = require('../miniapp/cloudfunctions/shared/admin-access')

  assert.deepEqual(normalizeAdminPermissions(undefined), ADMIN_WEB_PERMISSIONS)
  assert.deepEqual(normalizeAdminPermissions(null), ADMIN_WEB_PERMISSIONS)
  assert.deepEqual(normalizeAdminPermissions([]), [])
  assert.deepEqual(
    normalizeAdminPermissions(['viewDashboard', 'viewDashboard', 'unknown', '', null]),
    ['viewDashboard']
  )
})

test('tmpDbFix stays disabled by default even for an otherwise authorized invocation', async () => {
  const tmpDbFix = loadFreshModule('../miniapp/cloudfunctions/tmpDbFix/index.js', {
    'wx-server-sdk': createTmpDbFixWxSdk(),
    '../payApi/internal-auth': {
      isAuthorizedInternalCall: () => true
    },
    '../common/catalog-data.js': {
      visibleProductsData: [],
      retainedFissionProduct: { name: '保留活动商品' },
      packagesData: []
    }
  })

  const result = await tmpDbFix.main({
    action: 'syncCatalog',
    confirm: 'SYNC_CATALOG'
  })

  assert.equal(result.code, 403)
  assert.match(result.msg, /未启用|disabled/i)
})

test('tmpDbFix requires a controlled action and confirmation when the env gate is enabled', async () => {
  const originalFlag = process.env.TMP_DB_FIX_ENABLED
  process.env.TMP_DB_FIX_ENABLED = 'true'

  try {
    const tmpDbFix = loadFreshModule('../miniapp/cloudfunctions/tmpDbFix/index.js', {
      'wx-server-sdk': createTmpDbFixWxSdk(),
      '../payApi/internal-auth': {
        isAuthorizedInternalCall: () => true
      },
      '../common/catalog-data.js': {
        visibleProductsData: [],
        retainedFissionProduct: { name: '保留活动商品' },
        packagesData: []
      }
    })

    const result = await tmpDbFix.main({})

    assert.equal(result.code, 403)
    assert.match(result.msg, /受控|confirm|action/i)
  } finally {
    if (originalFlag === undefined) {
      delete process.env.TMP_DB_FIX_ENABLED
    } else {
      process.env.TMP_DB_FIX_ENABLED = originalFlag
    }
  }
})

test('tmpDbFix runs only after env enablement and a controlled authorized request are both present', async () => {
  const originalFlag = process.env.TMP_DB_FIX_ENABLED
  process.env.TMP_DB_FIX_ENABLED = 'true'

  try {
    const tmpDbFix = loadFreshModule('../miniapp/cloudfunctions/tmpDbFix/index.js', {
      'wx-server-sdk': createTmpDbFixWxSdk(),
      '../payApi/internal-auth': {
        isAuthorizedInternalCall: () => true
      },
      '../common/catalog-data.js': {
        visibleProductsData: [{ name: '商品 A', type: 'physical' }],
        retainedFissionProduct: { name: '保留活动商品', type: 'service' },
        packagesData: []
      }
    })

    const result = await tmpDbFix.main({
      action: 'syncCatalog',
      confirm: 'SYNC_CATALOG'
    })

    assert.equal(result.code, 0)
    assert.match(result.msg, /商品同步/)
  } finally {
    if (originalFlag === undefined) {
      delete process.env.TMP_DB_FIX_ENABLED
    } else {
      process.env.TMP_DB_FIX_ENABLED = originalFlag
    }
  }
})


test('createOrder rejects fission campaign order when first purchase quantity exceeds limitPerUser', async () => {
  const payApi = loadFreshModule('../miniapp/cloudfunctions/payApi/index.js', {
    'wx-server-sdk': createPayApiWxSdk({
      openid: 'user-1',
      orders: [],
      campaign: {
        _id: 'campaign-1',
        status: 'active',
        startTime: '2020-01-01T00:00:00Z',
        endTime: '2030-12-31T23:59:59Z',
        limitPerUser: 2,
        totalStock: 100,
        soldCount: 0,
        productId: 'product-1',
        activityPrice: 100
      }
    })
  })

  const result = await payApi.main({
    action: 'createOrder',
    productId: 'product-1',
    quantity: 3,
    fissionCampaignId: 'campaign-1'
  })

  assert.equal(result.code, -1)
  assert.match(result.msg, /限购/)
})

test('createOrder rejects fission campaign order when cumulative quantity exceeds limitPerUser', async () => {
  const payApi = loadFreshModule('../miniapp/cloudfunctions/payApi/index.js', {
    'wx-server-sdk': createPayApiWxSdk({
      openid: 'user-1',
      orders: [
        { _id: 'order-1', _openid: 'user-1', fissionCampaignId: 'campaign-1', quantity: 2, status: 'paid', orderNo: 'ORD-1' }
      ],
      campaign: {
        _id: 'campaign-1',
        status: 'active',
        startTime: '2020-01-01T00:00:00Z',
        endTime: '2030-12-31T23:59:59Z',
        limitPerUser: 3,
        totalStock: 100,
        soldCount: 2,
        productId: 'product-1',
        activityPrice: 100
      }
    })
  })

  const result = await payApi.main({
    action: 'createOrder',
    productId: 'product-1',
    quantity: 2,
    fissionCampaignId: 'campaign-1'
  })

  assert.equal(result.code, -1)
  assert.match(result.msg, /限购/)
})

test('createOrder allows fission campaign order when cumulative quantity equals limitPerUser', async () => {
  const payApi = loadFreshModule('../miniapp/cloudfunctions/payApi/index.js', {
    'wx-server-sdk': createPayApiWxSdk({
      openid: 'user-1',
      orders: [
        { _id: 'order-1', _openid: 'user-1', fissionCampaignId: 'campaign-1', quantity: 2, status: 'paid', orderNo: 'ORD-1' }
      ],
      campaign: {
        _id: 'campaign-1',
        status: 'active',
        startTime: '2020-01-01T00:00:00Z',
        endTime: '2030-12-31T23:59:59Z',
        limitPerUser: 4,
        totalStock: 100,
        soldCount: 2,
        productId: 'product-1',
        activityPrice: 100
      }
    })
  })

  const result = await payApi.main({
    action: 'createOrder',
    productId: 'product-1',
    quantity: 2,
    fissionCampaignId: 'campaign-1'
  })

  assert.equal(result.code, 0)
  assert.ok(result.data.orderNo)
})


test('createOrder limits by total quantity across more than 100 historical orders', async () => {
  // CloudBase 默认 .get() 只返回 100 条；代码使用 skip/limit 分页累计避免漏统计
  const historicalOrders = Array.from({ length: 150 }, (_, i) => ({
    _id: `order-hist-${i}`,
    _openid: 'user-1',
    fissionCampaignId: 'campaign-1',
    quantity: 1,
    status: 'paid',
    orderNo: `ORD-HIST-${i}`
  }))

  const payApi = loadFreshModule('../miniapp/cloudfunctions/payApi/index.js', {
    'wx-server-sdk': createPayApiWxSdk({
      openid: 'user-1',
      orders: historicalOrders,
      campaign: {
        _id: 'campaign-1',
        status: 'active',
        startTime: '2020-01-01T00:00:00Z',
        endTime: '2030-12-31T23:59:59Z',
        limitPerUser: 200,
        totalStock: 1000,
        soldCount: 150,
        productId: 'product-1',
        activityPrice: 100
      }
    })
  })

  // 已有 150 份，再买 50 份 = 刚好 200（等于 limitPerUser），应允许
  const result = await payApi.main({
    action: 'createOrder',
    productId: 'product-1',
    quantity: 50,
    fissionCampaignId: 'campaign-1'
  })

  assert.equal(result.code, 0)
  assert.ok(result.data.orderNo)

  // 已有 150 份，再买 51 份 = 201（超过 limitPerUser），应拒绝
  const payApi2 = loadFreshModule('../miniapp/cloudfunctions/payApi/index.js', {
    'wx-server-sdk': createPayApiWxSdk({
      openid: 'user-1',
      orders: historicalOrders,
      campaign: {
        _id: 'campaign-1',
        status: 'active',
        startTime: '2020-01-01T00:00:00Z',
        endTime: '2030-12-31T23:59:59Z',
        limitPerUser: 200,
        totalStock: 1000,
        soldCount: 150,
        productId: 'product-1',
        activityPrice: 100
      }
    })
  })

  const result2 = await payApi2.main({
    action: 'createOrder',
    productId: 'product-1',
    quantity: 51,
    fissionCampaignId: 'campaign-1'
  })

  assert.equal(result2.code, -1)
  assert.match(result2.msg, /限购/)
})


test('createOrder paginates when historical orders exceed single page limit of 1000', async () => {
  // countExistingPurchaseQuantity 使用 skip/limit(1000) 分页累计
  // 构造 1500 条历史订单，确保必须读第二页才能统计完整
  const historicalOrders = Array.from({ length: 1500 }, (_, i) => ({
    _id: `order-hist-${i}`,
    _openid: 'user-1',
    fissionCampaignId: 'campaign-1',
    quantity: 1,
    status: 'paid',
    orderNo: `ORD-HIST-${i}`
  }))

  const payApi = loadFreshModule('../miniapp/cloudfunctions/payApi/index.js', {
    'wx-server-sdk': createPayApiWxSdk({
      openid: 'user-1',
      orders: historicalOrders,
      campaign: {
        _id: 'campaign-1',
        status: 'active',
        startTime: '2020-01-01T00:00:00Z',
        endTime: '2030-12-31T23:59:59Z',
        limitPerUser: 2000,
        totalStock: 10000,
        soldCount: 1500,
        productId: 'product-1',
        activityPrice: 100
      }
    })
  })

  // 已有 1500 份，再买 500 份 = 刚好 2000（等于 limitPerUser），应允许
  const result = await payApi.main({
    action: 'createOrder',
    productId: 'product-1',
    quantity: 500,
    fissionCampaignId: 'campaign-1'
  })

  assert.equal(result.code, 0)
  assert.ok(result.data.orderNo)

  // 已有 1500 份，再买 501 份 = 2001（超过 limitPerUser），应拒绝
  const payApi2 = loadFreshModule('../miniapp/cloudfunctions/payApi/index.js', {
    'wx-server-sdk': createPayApiWxSdk({
      openid: 'user-1',
      orders: historicalOrders,
      campaign: {
        _id: 'campaign-1',
        status: 'active',
        startTime: '2020-01-01T00:00:00Z',
        endTime: '2030-12-31T23:59:59Z',
        limitPerUser: 2000,
        totalStock: 10000,
        soldCount: 1500,
        productId: 'product-1',
        activityPrice: 100
      }
    })
  })

  const result2 = await payApi2.main({
    action: 'createOrder',
    productId: 'product-1',
    quantity: 501,
    fissionCampaignId: 'campaign-1'
  })

  assert.equal(result2.code, -1)
  assert.match(result2.msg, /限购/)
})

test('createOrder enforces fission campaign limit atomically across concurrent requests', async () => {
  const orders = []
  const payApi = loadFreshModule('../miniapp/cloudfunctions/payApi/index.js', {
    'wx-server-sdk': createPayApiWxSdk({
      openid: 'user-1',
      orders,
      simulateConcurrentLimitRace: true,
      campaign: {
        _id: 'campaign-1',
        status: 'active',
        startTime: '2020-01-01T00:00:00Z',
        endTime: '2030-12-31T23:59:59Z',
        limitPerUser: 1,
        totalStock: 100,
        soldCount: 0,
        productId: 'product-1',
        activityPrice: 100
      }
    })
  })

  const event = {
    action: 'createOrder',
    productId: 'product-1',
    quantity: 1,
    fissionCampaignId: 'campaign-1'
  }

  const [resultA, resultB] = await Promise.all([
    payApi.main(event),
    payApi.main(event)
  ])

  const codes = [resultA.code, resultB.code].sort((a, b) => a - b)
  assert.deepEqual(codes, [-1, 0])
  assert.equal(orders.filter(order => order.fissionCampaignId === 'campaign-1').length, 1)
})
