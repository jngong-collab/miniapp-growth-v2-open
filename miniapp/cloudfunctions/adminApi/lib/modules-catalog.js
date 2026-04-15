const { db } = require('./context')
const { getAccessStoreId, safeGetById, safeList, writeAuditLog } = require('./data')
const { fenToYuan, splitPlainList } = require('./helpers')

function normalizeProductPayload(payload) {
  return {
    _id: payload._id || '',
    name: String(payload.name || '').trim(),
    type: payload.type || 'physical',
    category: String(payload.category || '').trim(),
    price: Number(payload.price || 0),
    originalPrice: Number(payload.originalPrice || payload.price || 0),
    description: String(payload.description || '').trim(),
    detail: String(payload.detail || '').trim(),
    efficacy: String(payload.efficacy || '').trim(),
    stock: payload.stock === '' || payload.stock === undefined || payload.stock === null ? -1 : Number(payload.stock),
    soldCount: Number(payload.soldCount || 0),
    sortOrder: Number(payload.sortOrder || 0),
    status: payload.status || 'on',
    tags: Array.isArray(payload.tags) ? payload.tags.filter(Boolean) : splitPlainList(payload.tags),
    deliveryType: payload.deliveryType || 'instore',
    showInMall: payload.showInMall !== false,
    images: Array.isArray(payload.images) ? payload.images.filter(Boolean) : splitPlainList(payload.images)
  }
}

function normalizePackagePayload(payload) {
  return {
    _id: payload._id || '',
    productId: String(payload.productId || '').trim(),
    validDays: Number(payload.validDays || 180),
    items: (payload.items || []).map(item => ({
      name: String(item.name || '').trim(),
      count: Number(item.count || 0)
    })).filter(item => item.name && item.count > 0)
  }
}

function summarizeProduct(product) {
  if (!product) return null
  return {
    name: product.name,
    type: product.type,
    price: product.price,
    stock: product.stock,
    status: product.status,
    showInMall: product.showInMall
  }
}

async function listProducts(access) {
  const storeId = getAccessStoreId(access)
  const products = await safeList('products', { storeId }, { orderBy: ['sortOrder', 'asc'], limit: 300 })
  return {
    code: 0,
    data: products.map(item => ({
      ...item,
      priceYuan: fenToYuan(item.price || 0),
      originalPriceYuan: fenToYuan(item.originalPrice || 0),
      statusLabel: item.status === 'on' ? '上架中' : '已下架',
      stockLabel: Number(item.stock) === -1 ? '不限库存' : Number(item.stock || 0)
    }))
  }
}

async function listPackages(access) {
  const storeId = getAccessStoreId(access)
  const [packages, products] = await Promise.all([
    safeList('packages', {}, { orderBy: ['createdAt', 'desc'], limit: 200 }),
    safeList('products', { storeId, type: 'package' }, { orderBy: ['updatedAt', 'desc'], limit: 100 })
  ])
  const productMap = products.reduce((acc, item) => {
    acc[item._id] = item
    return acc
  }, {})

  return {
    code: 0,
    data: packages.map(item => ({
      ...item,
      productName: productMap[item.productId] ? productMap[item.productId].name : item.name || '套餐',
      itemsText: (item.items || []).map(service => `${service.name} x${service.count}`).join('、')
    }))
  }
}

async function saveProduct(access, event) {
  const payload = normalizeProductPayload(event.payload || {})
  const storeId = getAccessStoreId(access)
  if (!payload.name) return { code: -1, msg: '请输入商品名称' }
  if (!payload.type) return { code: -1, msg: '请选择商品类型' }

  const existing = payload._id ? await safeGetById('products', payload._id) : null
  if (existing && existing.storeId && existing.storeId !== storeId) {
    return { code: -1, msg: '无权限编辑该商品' }
  }
  const now = db.serverDate()

  if (existing) {
    const productId = payload._id
    delete payload._id
    await db.collection('products').doc(productId).update({
      data: { ...payload, updatedAt: now }
    })
    const updated = await safeGetById('products', productId)
    await writeAuditLog(access, {
      action: 'catalog.saveProduct',
      module: 'catalog',
      targetType: 'product',
      targetId: productId,
      summary: `更新商品 ${updated.name}`,
      detail: { before: summarizeProduct(existing), after: summarizeProduct(updated) }
    })
    return { code: 0, data: updated, msg: '商品已更新' }
  }

  delete payload._id
  const addRes = await db.collection('products').add({
    data: { ...payload, storeId, createdAt: now, updatedAt: now }
  })
  const created = await safeGetById('products', addRes._id)
  await writeAuditLog(access, {
    action: 'catalog.saveProduct',
    module: 'catalog',
    targetType: 'product',
    targetId: addRes._id,
    summary: `新增商品 ${created.name}`,
    detail: { after: summarizeProduct(created) }
  })
  return { code: 0, data: created, msg: '商品已创建' }
}

async function toggleProductStatus(access, event) {
  const storeId = getAccessStoreId(access)
  const { productId = '', status = '' } = event
  if (!productId || !['on', 'off'].includes(status)) return { code: -1, msg: '参数错误' }
  const product = await safeGetById('products', productId)
  if (!product) return { code: -1, msg: '商品不存在' }
  if (product.storeId && product.storeId !== storeId) {
    return { code: -1, msg: '无权限编辑该商品' }
  }

  await db.collection('products').doc(productId).update({
    data: { status, updatedAt: db.serverDate() }
  })
  const updated = await safeGetById('products', productId)
  await writeAuditLog(access, {
    action: 'catalog.toggleProductStatus',
    module: 'catalog',
    targetType: 'product',
    targetId: productId,
    summary: `${status === 'on' ? '上架' : '下架'}商品 ${product.name}`,
    detail: { status }
  })
  return { code: 0, data: updated, msg: '商品状态已更新' }
}

async function savePackage(access, event) {
  const payload = normalizePackagePayload(event.payload || {})
  if (!payload.productId) return { code: -1, msg: '请选择套餐商品' }
  if (!payload.items.length) return { code: -1, msg: '请至少配置一项套餐内容' }

  const existing = payload._id ? await safeGetById('packages', payload._id) : null
  const now = db.serverDate()

  if (existing) {
    const packageId = payload._id
    delete payload._id
    await db.collection('packages').doc(packageId).update({
      data: { ...payload, updatedAt: now }
    })
    const updated = await safeGetById('packages', packageId)
    await writeAuditLog(access, {
      action: 'catalog.savePackage',
      module: 'catalog',
      targetType: 'package',
      targetId: packageId,
      summary: `更新套餐配置 ${packageId}`,
      detail: { before: existing, after: updated }
    })
    return { code: 0, data: updated, msg: '套餐已更新' }
  }

  delete payload._id
  const addRes = await db.collection('packages').add({
    data: { ...payload, createdAt: now, updatedAt: now }
  })
  const created = await safeGetById('packages', addRes._id)
  await writeAuditLog(access, {
    action: 'catalog.savePackage',
    module: 'catalog',
    targetType: 'package',
    targetId: addRes._id,
    summary: `新增套餐配置 ${addRes._id}`,
    detail: { after: created }
  })
  return { code: 0, data: created, msg: '套餐已创建' }
}

async function getProductDetail(access, event) {
  const storeId = getAccessStoreId(access)
  const { productId = '' } = event || {}
  if (!productId) return { code: -1, msg: '缺少商品 ID' }

  const product = await safeGetById('products', productId)
  if (!product) return { code: -1, msg: '商品不存在' }
  if (product.storeId && product.storeId !== storeId) {
    return { code: -1, msg: '无权限查看该商品' }
  }

  const packages = await safeList('packages', { productId }, { limit: 10 })
  return {
    code: 0,
    data: {
      ...product,
      priceYuan: fenToYuan(product.price || 0),
      originalPriceYuan: fenToYuan(product.originalPrice || 0),
      packages: packages.map(item => ({
        ...item,
        itemsText: (item.items || []).map(service => `${service.name} x${service.count}`).join('、')
      }))
    }
  }
}

module.exports = {
  listProducts,
  listPackages,
  saveProduct,
  toggleProductStatus,
  savePackage,
  getProductDetail
}
