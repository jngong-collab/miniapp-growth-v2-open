const { db, _cmd } = require('./context')
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
  const productPayload = normalizeProductPayload({
    ...payload,
    type: 'package',
    category: String(payload.category || '').trim() || '超值套餐',
    deliveryType: 'instore'
  })

  return {
    packageId: String(payload._id || '').trim(),
    productId: String(payload.productId || '').trim(),
    product: productPayload,
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
    category: product.category,
    price: product.price,
    stock: product.stock,
    status: product.status,
    showInMall: product.showInMall
  }
}

function summarizePackageConfig(packageConfig) {
  if (!packageConfig) return null
  return {
    _id: packageConfig._id,
    productId: packageConfig.productId,
    validDays: packageConfig.validDays,
    items: packageConfig.items
  }
}

function buildPackageRecord(product, packageConfig) {
  if (!product && !packageConfig) return null
  const config = packageConfig || {}
  const source = product || {}
  const productType = String(source.type || '').trim()
  const isDedicatedPackage = productType === 'package'
  const hasLinkedProduct = Boolean(source && source._id)

  return {
    _id: config._id || '',
    productId: String(source._id || config.productId || '').trim(),
    name: String(source.name || config.name || '').trim() || (hasLinkedProduct ? '未命名套餐' : '未关联套餐商品'),
    productName: String(source.name || config.name || '').trim() || '',
    type: isDedicatedPackage ? 'package' : productType || 'package',
    category: String(source.category || '').trim() || '超值套餐',
    price: Number(source.price || 0),
    originalPrice: Number(source.originalPrice || 0),
    priceYuan: fenToYuan(source.price || 0),
    originalPriceYuan: fenToYuan(source.originalPrice || 0),
    stock: source.stock === '' || source.stock === undefined || source.stock === null ? -1 : Number(source.stock),
    stockLabel: Number(source.stock) === -1 || source.stock === '' || source.stock === undefined || source.stock === null ? '不限库存' : Number(source.stock || 0),
    soldCount: Number(source.soldCount || 0),
    status: source.status || 'off',
    statusLabel: source.status === 'on' ? '上架中' : '已下架',
    showInMall: source.showInMall !== false,
    sortOrder: Number(source.sortOrder || 0),
    deliveryType: source.deliveryType || 'instore',
    description: String(source.description || '').trim(),
    detail: String(source.detail || '').trim(),
    efficacy: String(source.efficacy || '').trim(),
    tags: Array.isArray(source.tags) ? source.tags : [],
    images: Array.isArray(source.images) ? source.images : [],
    validDays: Number(config.validDays || 180),
    items: Array.isArray(config.items) ? config.items : [],
    itemsText: (config.items || []).map(service => `${service.name} x${service.count}`).join('、'),
    isLegacyBinding: !isDedicatedPackage,
    legacyBindingType: !isDedicatedPackage ? productType || 'missing' : ''
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
  const packageProducts = (await safeList('products', { storeId, type: 'package' }, { orderBy: ['updatedAt', 'desc'], limit: 100 }))
    .filter(item => item.archived !== true)
  const packageConfigs = await safeList('packages', { storeId }, { orderBy: ['updatedAt', 'desc'], limit: 200 })

  const productMap = packageProducts.reduce((acc, item) => {
    acc[item._id] = item
    return acc
  }, {})
  const packageProductIds = Object.keys(productMap)
  const legacyProductIds = Array.from(new Set(
    packageConfigs
      .map(item => String(item.productId || '').trim())
      .filter(Boolean)
      .filter(id => !productMap[id])
  ))
  const legacyProducts = legacyProductIds.length
    ? await safeList('products', { storeId, _id: _cmd.in(legacyProductIds) }, { limit: legacyProductIds.length })
    : []

  legacyProducts.forEach(item => {
    if (item && item._id) {
      productMap[item._id] = item
    }
  })

  const packageMap = packageConfigs.reduce((acc, item) => {
    const key = String(item.productId || '').trim() || String(item._id || '').trim()
    if (!acc[key]) acc[key] = item
    return acc
  }, {})
  const recordOrder = Array.from(new Set([
    ...packageProductIds,
    ...packageConfigs.map(item => String(item.productId || '').trim()).filter(Boolean)
  ]))

  return {
    code: 0,
    data: recordOrder
      .map(productId => buildPackageRecord(productMap[productId] || null, packageMap[productId] || null))
      .filter(Boolean)
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
  const storeId = getAccessStoreId(access)
  const payload = normalizePackagePayload(event.payload || {})
  if (!payload.product.name) return { code: -1, msg: '请输入套餐名称' }
  if (!payload.items.length) return { code: -1, msg: '请至少配置一项套餐内容' }

  const existingPackage = payload.packageId ? await safeGetById('packages', payload.packageId) : null
  if (existingPackage && existingPackage.storeId && existingPackage.storeId !== storeId) {
    return { code: -1, msg: '无权限编辑该套餐' }
  }

  const inferredProductId = payload.productId || (existingPackage && existingPackage.productId) || ''
  const existingProduct = inferredProductId ? await safeGetById('products', inferredProductId) : null
  if (inferredProductId && !existingProduct) {
    if (!existingPackage) {
      return { code: -1, msg: '关联套餐商品不存在' }
    }
  }
  if (existingProduct && existingProduct.storeId && existingProduct.storeId !== storeId) {
    return { code: -1, msg: '无权限编辑该套餐商品' }
  }

  const now = db.serverDate()
  let productId = inferredProductId
  const canReusePackageProduct = existingProduct && existingProduct.type === 'package'
  let beforeProduct = canReusePackageProduct ? existingProduct : null
  let updatedProduct = null

  if (canReusePackageProduct) {
    await db.collection('products').doc(productId).update({
      data: { ...payload.product, type: 'package', category: payload.product.category || '超值套餐', deliveryType: 'instore', updatedAt: now, archived: false }
    })
    updatedProduct = await safeGetById('products', productId)
  } else {
    const addProductRes = await db.collection('products').add({
      data: {
        ...payload.product,
        type: 'package',
        category: payload.product.category || '超值套餐',
        deliveryType: 'instore',
        storeId,
        archived: false,
        createdAt: now,
        updatedAt: now
      }
    })
    productId = addProductRes._id
    updatedProduct = await safeGetById('products', productId)
    beforeProduct = null
  }

  const packageDocPayload = {
    storeId,
    productId,
    validDays: payload.validDays,
    items: payload.items,
    updatedAt: now
  }

  let packageConfig = existingPackage
  if (!packageConfig && productId) {
    const matched = await safeList('packages', { storeId, productId }, { orderBy: ['updatedAt', 'desc'], limit: 1 })
    packageConfig = matched[0] || null
  }

  let updatedPackage = null
  if (packageConfig) {
    await db.collection('packages').doc(packageConfig._id).update({
      data: packageDocPayload
    })
    updatedPackage = await safeGetById('packages', packageConfig._id)
  } else {
    const addPackageRes = await db.collection('packages').add({
      data: { ...packageDocPayload, createdAt: now }
    })
    updatedPackage = await safeGetById('packages', addPackageRes._id)
  }

  await writeAuditLog(access, {
    action: 'catalog.savePackage',
    module: 'catalog',
    targetType: 'package',
    targetId: updatedPackage ? updatedPackage._id : productId,
    summary: `${existingPackage || beforeProduct ? '更新' : '新增'}套餐 ${updatedProduct.name}`,
    detail: {
      before: {
        product: summarizeProduct(beforeProduct),
        package: summarizePackageConfig(existingPackage)
      },
      after: {
        product: summarizeProduct(updatedProduct),
        package: summarizePackageConfig(updatedPackage)
      }
    }
  })

  return {
    code: 0,
    data: buildPackageRecord(updatedProduct, updatedPackage),
    msg: existingPackage || beforeProduct ? '套餐已更新' : '套餐已创建'
  }
}

async function deletePackage(access, event) {
  const storeId = getAccessStoreId(access)
  const packageId = String((event && event.packageId) || '').trim()
  let productId = String((event && event.productId) || '').trim()
  const packageConfig = packageId ? await safeGetById('packages', packageId) : null

  if (packageConfig && packageConfig.storeId && packageConfig.storeId !== storeId) {
    return { code: -1, msg: '无权限删除该套餐' }
  }
  if (!productId && packageConfig) {
    productId = String(packageConfig.productId || '').trim()
  }
  if (!productId) return { code: -1, msg: '缺少套餐商品 ID' }

  const product = await safeGetById('products', productId)
  if (product && product.storeId && product.storeId !== storeId) {
    return { code: -1, msg: '无权限删除该套餐商品' }
  }
  if (!product && !packageConfig) return { code: -1, msg: '套餐商品不存在' }

  const relatedPackages = await safeList('packages', { storeId, productId }, { orderBy: ['updatedAt', 'desc'], limit: 20 })
  for (const item of relatedPackages) {
    await db.collection('packages').doc(item._id).remove().catch(() => null)
  }

  if (product && product.type === 'package') {
    await db.collection('products').doc(productId).update({
      data: {
        status: 'off',
        showInMall: false,
        archived: true,
        updatedAt: db.serverDate()
      }
    })
  }

  await writeAuditLog(access, {
    action: 'catalog.deletePackage',
    module: 'catalog',
    targetType: 'package',
    targetId: packageId || productId,
    summary: `删除套餐 ${(product && product.name) || (packageConfig && packageConfig.productId) || productId}`,
    detail: {
      before: {
        product: summarizeProduct(product),
        package: summarizePackageConfig(packageConfig || relatedPackages[0] || null)
      },
      after: {
        archived: Boolean(product && product.type === 'package'),
        removedPackageCount: relatedPackages.length
      }
    }
  })

  return {
    code: 0,
    data: { productId, removedPackageCount: relatedPackages.length },
    msg: '套餐已删除'
  }
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

  const packages = await safeList('packages', { storeId, productId }, { limit: 10 })
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
  deletePackage,
  getProductDetail
}
