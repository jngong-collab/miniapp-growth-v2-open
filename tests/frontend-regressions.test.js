const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..')

function readSource(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8')
}

function countMatches(source, pattern) {
  return (source.match(pattern) || []).length
}

function loadMiniappPage(relPath) {
  const pageModulePath = path.join(repoRoot, relPath)
  delete require.cache[require.resolve(pageModulePath)]

  let pageDef = null
  global.Page = definition => {
    pageDef = definition
  }

  require(pageModulePath)
  assert.ok(pageDef, `expected Page() definition for ${relPath}`)

  return pageDef
}

test('admin-web modals keep destroyOnHidden so state is discarded when reopened', () => {
  const campaignsSource = readSource('admin-web/src/pages/campaigns-page.tsx')
  const catalogSource = readSource('admin-web/src/pages/catalog-page.tsx')

  assert.equal(countMatches(campaignsSource, /destroyOnHidden/g), 2)
  assert.equal(countMatches(catalogSource, /destroyOnHidden/g), 2)
  assert.equal(countMatches(campaignsSource, /destroyOnClose/g), 0)
  assert.equal(countMatches(catalogSource, /destroyOnClose/g), 0)
})

test('catalog edit flow round-trips newline text into trimmed arrays', () => {
  const catalogSource = readSource('admin-web/src/pages/catalog-page.tsx')

  assert.match(catalogSource, /function formatListText/)
  assert.match(catalogSource, /function parseListText/)
  assert.match(catalogSource, /map\(item => item\.trim\(\)\)/)
  assert.match(catalogSource, /filter\(Boolean\)/)
  assert.match(catalogSource, /split\(\s*\/\[\\n,，\]\/\s*\)/)
  assert.match(catalogSource, /formatListText\(record\.tags\)/)
  assert.match(catalogSource, /formatListText\(record\.images\)/)
  assert.match(catalogSource, /parseListText\(values\.tags\)/)
  assert.match(catalogSource, /parseListText\(values\.images\)/)
})

test('product detail omits invalid discount text when original price is missing or zero', async () => {
  const pageDef = loadMiniappPage('miniapp/pages/product-detail/product-detail.js')
  const wxCalls = { setNavigationBarTitle: [] }

  try {
    global.wx = {
      cloud: {
        callFunction({ name, data }) {
          assert.equal(name, 'commerceApi')
          assert.equal(data.action, 'getProductDetail')
          return Promise.resolve({
            result: {
              code: 0,
              data: {
                product: {
                  _id: 'product-1',
                  name: '泡浴包',
                  price: 1990,
                  originalPrice: 0,
                  images: []
                }
              }
            }
          })
        }
      },
      setNavigationBarTitle(payload) {
        wxCalls.setNavigationBarTitle.push(payload)
      },
      showToast() {}
    }

    const page = {
      ...pageDef,
      data: JSON.parse(JSON.stringify(pageDef.data)),
      setData(update) {
        this.data = { ...this.data, ...update }
      }
    }

    await page._loadProduct('product-1')

    assert.equal(page.data.product.discountText, undefined)
    assert.equal(page.data.product.originalPriceYuan, '0.0')
    assert.equal(page.data.loading, false)
    assert.deepEqual(wxCalls.setNavigationBarTitle, [{ title: '泡浴包' }])
  } finally {
    delete global.Page
    delete global.wx
  }
})

test('lottery animation falls back to prize name when backend prize id is missing', async () => {
  const pageDef = loadMiniappPage('miniapp/pages/lottery/lottery.js')
  const originalSetTimeout = global.setTimeout
  const originalRandom = Math.random

  try {
    global.setTimeout = fn => {
      fn()
      return 0
    }
    Math.random = () => 0

    global.wx = {
      cloud: {
        callFunction({ name, data }) {
          assert.equal(name, 'growthApi')
          if (data.action === 'drawLottery') {
            return Promise.resolve({
              result: {
                code: 0,
                data: {
                  prize: {
                    name: '一等奖',
                    icon: '🎁',
                    claimHint: '请到前台领取'
                  },
                  remainChances: 2
                },
              }
            })
          }
          if (data.action === 'getLotteryHome') {
            return Promise.resolve({
              result: {
                code: 0,
                data: {
                  campaign: null,
                  remainChances: 2,
                  records: []
                }
              }
            })
          }
          throw new Error(`unexpected action: ${data.action}`)
        }
      },
      showToast() {},
      showLoading() {},
      hideLoading() {},
      vibrateShort() {
        return Promise.resolve()
      }
    }

    const page = {
      ...pageDef,
      data: JSON.parse(JSON.stringify(pageDef.data)),
      setData(update) {
        this.data = { ...this.data, ...update }
      }
    }

    page.data.prizes = [
      { id: 0, name: 'A', icon: '🎁', color: '#FFF8E1' },
      { id: 1, name: 'B', icon: '🎁', color: '#FFF8E1' },
      { id: 2, name: '一等奖', icon: '🎁', color: '#FFF8E1' },
      { id: 3, name: 'C', icon: '🎁', color: '#FFF8E1' },
      { id: 'draw', name: '', icon: '', color: '' },
      { id: 5, name: 'D', icon: '🎁', color: '#FFF8E1' },
      { id: 6, name: 'E', icon: '🎁', color: '#FFF8E1' },
      { id: 7, name: 'F', icon: '🎁', color: '#FFF8E1' },
      { id: 8, name: 'G', icon: '🎁', color: '#FFF8E1' }
    ]
    page.data.remainChances = 3

    await page.startLottery()

    assert.equal(page.data.resultPrize.name, '一等奖')
    assert.equal(page.data.currentIndex, 2)
    assert.equal(page.data.isRunning, false)
    assert.equal(page.data.showResult, true)
  } finally {
    global.setTimeout = originalSetTimeout
    Math.random = originalRandom
    delete global.Page
    delete global.wx
  }
})

test('cart accepts string -1 stock as unlimited inventory', () => {
  const storage = new Map()
  global.wx = {
    getStorageSync(key) {
      return storage.get(key)
    },
    setStorageSync(key, value) {
      storage.set(key, value)
    },
    removeStorageSync(key) {
      storage.delete(key)
    }
  }

  const { addCartItem, canAddProductToCart, getCartItems } = require('../miniapp/utils/cart')

  const product = {
    _id: 'prod-unlimited',
    name: '不限库存商品',
    type: 'physical',
    price: 2990,
    images: ['/assets/unlimited.png'],
    stock: '-1'
  }

  assert.deepEqual(canAddProductToCart(product, null), { ok: true, reason: '' })

  addCartItem(product, 1)
  assert.deepEqual(getCartItems(), [{
    productId: 'prod-unlimited',
    name: '不限库存商品',
    image: '/assets/unlimited.png',
    price: 2990,
    priceYuan: '29.9',
    quantity: 1,
    stock: -1,
    checked: true
  }])

  delete global.wx
})
