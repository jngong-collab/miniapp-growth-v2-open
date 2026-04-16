const { fenToYuan } = require('./util')

const CART_STORAGE_KEY = 'mall_cart_items_v1'

function getStorageApi() {
    if (typeof wx === 'undefined') {
        return {
            getStorageSync() { return [] },
            setStorageSync() { },
            removeStorageSync() { }
        }
    }
    return wx
}

function normalizePositiveInteger(value, fallback = 1) {
    const nextValue = Number.parseInt(value, 10)
    return Number.isFinite(nextValue) && nextValue > 0 ? nextValue : fallback
}

function normalizeStockValue(value) {
    if (Number(value) === -1 || String(value) === '-1') return -1
    const nextValue = Number.parseInt(value, 10)
    if (!Number.isFinite(nextValue)) return 9999
    if (nextValue <= 0) return 0
    return nextValue
}

function normalizeCartItem(rawItem) {
    if (!rawItem || !rawItem.productId) return null

    const quantity = normalizePositiveInteger(rawItem.quantity, 1)
    const price = Number(rawItem.price || 0)
    const stock = normalizeStockValue(rawItem.stock)

    return {
        productId: String(rawItem.productId),
        name: rawItem.name || '',
        image: rawItem.image || '',
        price,
        priceYuan: fenToYuan(price, 1),
        quantity: stock === -1 ? quantity : Math.min(quantity, stock),
        stock,
        checked: rawItem.checked !== false
    }
}

function getCartItems() {
    const storageApi = getStorageApi()
    const rawItems = storageApi.getStorageSync(CART_STORAGE_KEY)
    if (!Array.isArray(rawItems)) return []
    return rawItems.map(normalizeCartItem).filter(item => item && item.quantity > 0)
}

function persistCartItems(items) {
    const storageApi = getStorageApi()
    const normalizedItems = (items || []).map(normalizeCartItem).filter(Boolean).filter(item => item.quantity > 0)
    if (!normalizedItems.length) {
        storageApi.removeStorageSync(CART_STORAGE_KEY)
        return []
    }
    storageApi.setStorageSync(CART_STORAGE_KEY, normalizedItems)
    return normalizedItems
}

function canAddProductToCart(product, campaign) {
    if (!product || !product._id) {
        return { ok: false, reason: '商品信息异常' }
    }
    if (campaign) {
        return { ok: false, reason: '活动商品请直接购买' }
    }
    if (product.type === 'service') {
        return { ok: false, reason: '服务类商品请直接购买' }
    }
    if (product.type === 'package') {
        return { ok: false, reason: '套餐类商品请直接购买' }
    }
    if (product.type !== 'physical') {
        return { ok: false, reason: '该商品暂不支持加入购物车' }
    }
    if (normalizeStockValue(product.stock) === 0) {
        return { ok: false, reason: '商品已售罄' }
    }
    return { ok: true, reason: '' }
}

function addCartItem(product, quantity = 1) {
    const eligibility = canAddProductToCart(product, null)
    if (!eligibility.ok) {
        const error = new Error(eligibility.reason)
        error.code = 'CART_INELIGIBLE'
        throw error
    }

    const nextQuantity = normalizePositiveInteger(quantity, 1)
    const cartItems = getCartItems()
    const existingIndex = cartItems.findIndex(item => item.productId === product._id)
    const stock = normalizeStockValue(product.stock)

    if (existingIndex >= 0) {
        const currentItem = cartItems[existingIndex]
        const mergedQuantity = currentItem.quantity + nextQuantity
        cartItems[existingIndex] = normalizeCartItem({
            ...currentItem,
            name: product.name,
            image: (product.images || [])[0] || currentItem.image,
            price: product.price,
            stock,
            quantity: stock === -1 ? mergedQuantity : Math.min(mergedQuantity, stock),
            checked: true
        })
    } else {
        cartItems.push(normalizeCartItem({
            productId: product._id,
            name: product.name,
            image: (product.images || [])[0] || '',
            price: product.price,
            stock,
            quantity: nextQuantity,
            checked: true
        }))
    }

    return persistCartItems(cartItems)
}

function updateCartItemQuantity(productId, quantity) {
    const cartItems = getCartItems()
    const nextItems = cartItems.map(item => {
        if (item.productId !== productId) return item
        return {
            ...item,
            quantity: item.stock === -1 ? normalizePositiveInteger(quantity, 1) : Math.min(normalizePositiveInteger(quantity, 1), item.stock)
        }
    })
    return persistCartItems(nextItems)
}

function setCartItemChecked(productId, checked) {
    const cartItems = getCartItems().map(item => item.productId === productId ? { ...item, checked: !!checked } : item)
    return persistCartItems(cartItems)
}

function toggleAllCartItems(checked) {
    return persistCartItems(getCartItems().map(item => ({ ...item, checked: !!checked })))
}

function removeCartItem(productId) {
    return persistCartItems(getCartItems().filter(item => item.productId !== productId))
}

function removeCartItems(productIds) {
    const idSet = new Set(productIds || [])
    return persistCartItems(getCartItems().filter(item => !idSet.has(item.productId)))
}

function getCheckedCartItems() {
    return getCartItems().filter(item => item.checked)
}

function getCartCount() {
    return getCartItems().length
}

function getCartBadgeCount() {
    return getCartItems().reduce((sum, item) => sum + item.quantity, 0)
}

function getCartSummary(items = getCheckedCartItems()) {
    const normalizedItems = (items || []).map(normalizeCartItem).filter(Boolean)
    const selectedCount = normalizedItems.length
    const selectedQuantity = normalizedItems.reduce((sum, item) => sum + item.quantity, 0)
    const totalAmount = normalizedItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
    return {
        selectedCount,
        selectedQuantity,
        totalAmount,
        totalAmountYuan: fenToYuan(totalAmount)
    }
}

module.exports = {
    CART_STORAGE_KEY,
    addCartItem,
    canAddProductToCart,
    getCartBadgeCount,
    getCartCount,
    getCartItems,
    getCartSummary,
    getCheckedCartItems,
    persistCartItems,
    removeCartItem,
    removeCartItems,
    setCartItemChecked,
    toggleAllCartItems,
    updateCartItemQuantity
}
