// 商品真源数据
// 本文件为静态业务数据源，禁止直接写入数据库运行时字段（如 _id、createdAt、updatedAt）
// 云函数共享模块在运行时会把本地素材路径映射为 cloud:// fileId；脚本侧则保留可发布的本地路径。

const fs = require('node:fs')
const path = require('node:path')
const catalogData = require('../miniapp/cloudfunctions/common/catalog-data.js')
const productImageMap = require('../miniapp/cloudfunctions/common/product-image-map.json')
const MINIPROGRAM_ROOT = path.join(__dirname, '..', 'miniapp')
const FALLBACK_IMAGE = '/assets/images/moxa-default.png'

const reverseImageMap = Object.entries(productImageMap).reduce((acc, [localPath, cloudPath]) => {
  if (cloudPath && !acc[cloudPath]) {
    acc[cloudPath] = localPath
  }
  return acc
}, {})

function resolvePublishedImage(image) {
  const restoredImage = reverseImageMap[image] || image
  const normalizedPath = String(restoredImage || '').trim()
  if (!normalizedPath.startsWith('/')) {
    return FALLBACK_IMAGE
  }

  const absolutePath = path.join(MINIPROGRAM_ROOT, normalizedPath.replace(/^\//, '').replace(/\//g, path.sep))
  return fs.existsSync(absolutePath) ? normalizedPath : FALLBACK_IMAGE
}

function restoreLocalImagesInPlace(product) {
  if (!product || !Array.isArray(product.images)) return product
  product.images = product.images.map(resolvePublishedImage)
  return product
}

const visibleProductsData = (catalogData.visibleProductsData || []).map(restoreLocalImagesInPlace)
const retainedFissionProduct = restoreLocalImagesInPlace(catalogData.retainedFissionProduct)

module.exports = {
  ...catalogData,
  visibleProductsData,
  retainedFissionProduct,
  allProductsData: [...visibleProductsData, retainedFissionProduct]
}
