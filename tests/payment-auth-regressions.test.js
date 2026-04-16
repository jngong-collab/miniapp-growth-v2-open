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

function createPayApiWxSdk({ openid = '', orders = [] } = {}) {
  const dbCommand = {
    neq: (value) => ({ op: 'neq', value }),
    gte: (value) => ({ op: 'gte', value }),
    inc: (value) => ({ op: 'inc', value })
  }

  const ordersCollection = {
    where(query) {
      return {
        limit() {
          return {
            async get() {
              if (query && query.orderNo) {
                return {
                  data: orders.filter(order => order.orderNo === query.orderNo)
                }
              }
              return { data: [] }
            }
          }
        }
      }
    },
    doc() {
      return {
        where() {
          return {
            async update() {
              return { stats: { updated: 1 } }
            }
          }
        }
      }
    }
  }

  const orderItemsCollection = {
    where() {
      return {
        async get() {
          return { data: [] }
        }
      }
    }
  }

  const productsCollection = {
    doc() {
      return {
        async get() {
          return { data: { stock: -1 } }
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
    database: () => ({
      command: dbCommand,
      serverDate: () => new Date('2026-04-15T00:00:00Z'),
      collection(name) {
        if (name === 'orders') return ordersCollection
        if (name === 'order_items') return orderItemsCollection
        if (name === 'products') return productsCollection
        return {
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
          }
        }
      }
    }),
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
