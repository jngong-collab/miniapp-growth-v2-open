const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..')

test('cart utilities only allow normal physical products and persist merged quantities', () => {
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

  const {
    addCartItem,
    getCartItems,
    getCartCount,
    getCartBadgeCount,
    canAddProductToCart,
    updateCartItemQuantity,
    removeCartItem
  } = require('../miniapp/utils/cart')

  const physicalProduct = {
    _id: 'prod-1',
    name: '五行泡浴包',
    type: 'physical',
    price: 1990,
    images: ['/assets/p1.png'],
    stock: 9
  }

  assert.deepEqual(canAddProductToCart(physicalProduct, null), { ok: true, reason: '' })
  assert.deepEqual(canAddProductToCart({ ...physicalProduct, type: 'service' }, null), {
    ok: false,
    reason: '服务类商品请直接购买'
  })
  assert.deepEqual(canAddProductToCart({ ...physicalProduct, type: 'package' }, null), {
    ok: false,
    reason: '套餐类商品请直接购买'
  })
  assert.deepEqual(canAddProductToCart(physicalProduct, { _id: 'campaign-1' }), {
    ok: false,
    reason: '活动商品请直接购买'
  })

  addCartItem(physicalProduct, 1)
  addCartItem(physicalProduct, 2)

  assert.equal(getCartCount(), 1)
  assert.equal(getCartBadgeCount(), 3)
  assert.deepEqual(getCartItems(), [{
    productId: 'prod-1',
    name: '五行泡浴包',
    image: '/assets/p1.png',
    price: 1990,
    priceYuan: '19.9',
    quantity: 3,
    stock: 9,
    checked: true
  }])

  updateCartItemQuantity('prod-1', 5)
  assert.equal(getCartItems()[0].quantity, 5)

  removeCartItem('prod-1')
  assert.deepEqual(getCartItems(), [])
  assert.equal(getCartBadgeCount(), 0)

  delete global.wx
})

test('cart utilities reject sold-out products instead of treating them as unlimited stock', () => {
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

  const {
    addCartItem,
    canAddProductToCart,
    getCartItems
  } = require('../miniapp/utils/cart')

  const soldOutProduct = {
    _id: 'prod-soldout',
    name: '售罄商品',
    type: 'physical',
    price: 2990,
    images: ['/assets/soldout.png'],
    stock: 0
  }

  assert.deepEqual(canAddProductToCart(soldOutProduct, null), {
    ok: false,
    reason: '商品已售罄'
  })

  assert.throws(() => addCartItem(soldOutProduct, 1), /商品已售罄/)
  assert.deepEqual(getCartItems(), [])

  delete global.wx
})

test('cart order helpers summarize multi-item physical orders for payment and listing', () => {
  const {
    summarizeCartOrderItems,
    buildOrderDisplayName
  } = require('../miniapp/cloudfunctions/payApi/order-helpers')

  const summary = summarizeCartOrderItems([
    { productId: 'prod-1', productName: '五行泡浴包', price: 1990, quantity: 2 },
    { productId: 'prod-2', productName: '草本精油', price: 990, quantity: 1 }
  ])

  assert.deepEqual(summary, {
    totalAmount: 4970,
    totalQuantity: 3,
    itemCount: 2,
    productName: '五行泡浴包等2件商品'
  })

  assert.equal(buildOrderDisplayName({
    productName: '五行泡浴包',
    items: [{ productName: '五行泡浴包' }]
  }), '五行泡浴包')

  assert.equal(buildOrderDisplayName({
    productName: '五行泡浴包等2件商品',
    items: [
      { productName: '五行泡浴包' },
      { productName: '草本精油' }
    ]
  }), '五行泡浴包等2件商品')
})

test('cart flow is wired into mini program routes and pages', () => {
  const appJson = fs.readFileSync(path.join(repoRoot, 'miniapp', 'app.json'), 'utf8')
  const mallWxml = fs.readFileSync(path.join(repoRoot, 'miniapp', 'pages', 'mall', 'mall.wxml'), 'utf8')
  const mallJs = fs.readFileSync(path.join(repoRoot, 'miniapp', 'pages', 'mall', 'mall.js'), 'utf8')
  const productDetailWxml = fs.readFileSync(path.join(repoRoot, 'miniapp', 'pages', 'product-detail', 'product-detail.wxml'), 'utf8')
  const ordersWxml = fs.readFileSync(path.join(repoRoot, 'miniapp', 'pages', 'orders', 'orders.wxml'), 'utf8')
  const commerceApi = fs.readFileSync(path.join(repoRoot, 'miniapp', 'cloudfunctions', 'commerceApi', 'index.js'), 'utf8')
  const payApi = fs.readFileSync(path.join(repoRoot, 'miniapp', 'cloudfunctions', 'payApi', 'index.js'), 'utf8')

  assert.match(appJson, /"pages\/cart\/cart"/)
  assert.match(mallWxml, /goToCart/)
  assert.match(mallWxml, /addToCart/)
  assert.match(mallJs, /cartCount/)
  assert.match(productDetailWxml, /goToCart/)
  assert.match(productDetailWxml, /addToCart/)
  assert.match(ordersWxml, /继续支付|去支付/)
  assert.match(commerceApi, /createCartOrder/)
  assert.match(payApi, /createCartOrder/)
})

test('cart checkout keeps selected items when payment setup fails after order creation', async () => {
  const storage = new Map()
  const calls = []

  global.wx = {
    getStorageSync(key) {
      return storage.get(key)
    },
    setStorageSync(key, value) {
      storage.set(key, value)
    },
    removeStorageSync(key) {
      storage.delete(key)
    },
    showLoading() {},
    hideLoading() {},
    showToast() {},
    showModal() {
      return Promise.resolve({ confirm: true })
    },
    navigateTo() {},
    redirectTo() {},
    requestPayment() {
      return Promise.resolve()
    },
    cloud: {
      callFunction({ name, data }) {
        calls.push({ name, action: data.action })
        if (data.action === 'createCartOrder') {
          return Promise.resolve({
            result: {
              code: 0,
              data: { orderId: 'order-1' }
            }
          })
        }
        if (data.action === 'requestPay') {
          return Promise.resolve({
            result: {
              code: -1,
              msg: '支付网关错误'
            }
          })
        }
        throw new Error(`unexpected action: ${data.action}`)
      }
    }
  }

  global.getApp = () => ({
    globalData: {
      openid: 'user-openid'
    }
  })

  const { addCartItem, getCartItems } = require('../miniapp/utils/cart')
  addCartItem({
    _id: 'prod-1',
    name: '五行泡浴包',
    type: 'physical',
    price: 1990,
    images: ['/assets/p1.png'],
    stock: 9
  }, 1)

  let pageDef = null
  global.Page = (definition) => {
    pageDef = definition
  }
  delete require.cache[require.resolve('../miniapp/pages/cart/cart.js')]
  require('../miniapp/pages/cart/cart.js')

  const page = {
    ...pageDef,
    data: JSON.parse(JSON.stringify(pageDef.data)),
    setData(update) {
      this.data = { ...this.data, ...update }
    }
  }

  page.loadCart()
  await page.checkout()

  assert.deepEqual(calls.map(item => item.action), ['createCartOrder', 'requestPay'])
  assert.deepEqual(getCartItems(), [{
    productId: 'prod-1',
    name: '五行泡浴包',
    image: '/assets/p1.png',
    price: 1990,
    priceYuan: '19.9',
    quantity: 1,
    stock: 9,
    checked: true
  }])

  delete global.Page
  delete global.getApp
  delete global.wx
})
