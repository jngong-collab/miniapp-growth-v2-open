#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const cloudbase = require('@cloudbase/node-sdk')

const PROJECT_ROOT = path.resolve(__dirname, '..')
const AUTH_PATH = path.join(process.env.USERPROFILE || '', '.config', '.cloudbase', 'auth.json')
const CLOUDBASERC_PATH = path.join(PROJECT_ROOT, 'cloudbaserc.json')
const LOCAL_IMAGE_DIR = path.join(PROJECT_ROOT, 'miniapp', 'chanpin')
const BACKUP_IMAGE_DIR = path.join(PROJECT_ROOT, 'chanpin')
const CLOUD_IMAGE_PREFIX = 'product-images/chanpin'
const MANIFEST_PATH = path.join(PROJECT_ROOT, 'miniapp', 'cloudfunctions', 'common', 'product-image-map.json')
const PAGE_SIZE = 100
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function resolveEnvId() {
  const rc = readJson(CLOUDBASERC_PATH)
  const envId = String(rc.envId || '').trim()
  if (!envId) {
    throw new Error('cloudbaserc.json 缺少 envId')
  }
  return envId
}

function createCloudbaseApp(envId) {
  const auth = readJson(AUTH_PATH)
  const credential = auth && auth.credential ? auth.credential : null
  if (!credential || !credential.tmpSecretId || !credential.tmpSecretKey || !credential.tmpToken) {
    throw new Error('未找到 CloudBase 临时凭证，请先执行 tcb login')
  }

  return cloudbase.init({
    env: envId,
    region: 'ap-shanghai',
    secretId: credential.tmpSecretId,
    secretKey: credential.tmpSecretKey,
    sessionToken: credential.tmpToken
  })
}

function listLocalImages() {
  const sourceDir = fs.existsSync(LOCAL_IMAGE_DIR) ? LOCAL_IMAGE_DIR : BACKUP_IMAGE_DIR
  return fs.readdirSync(sourceDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map(entry => ({
      fileName: entry.name,
      localPath: path.join(sourceDir, entry.name),
      localRef: `/chanpin/${entry.name}`,
      cloudPath: `${CLOUD_IMAGE_PREFIX}/${entry.name}`
    }))
    .sort((a, b) => a.fileName.localeCompare(b.fileName, 'zh-CN'))
}

async function uploadImages(app, imageEntries) {
  const mapping = {}

  for (const entry of imageEntries) {
    const result = await app.uploadFile({
      cloudPath: entry.cloudPath,
      fileContent: fs.createReadStream(entry.localPath)
    })
    mapping[entry.localRef] = result.fileID
    console.log(`上传完成: ${entry.fileName}`)
  }

  return mapping
}

async function listAllProducts(db) {
  const products = []
  let page = 0

  while (true) {
    const res = await db.collection('products')
      .orderBy('sortOrder', 'asc')
      .skip(page * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .get()

    const rows = res.data || []
    products.push(...rows)

    if (rows.length < PAGE_SIZE) {
      break
    }
    page += 1
  }

  return products
}

function remapImages(images, mapping) {
  const list = Array.isArray(images) ? images : []
  let changed = false
  const next = list.map(item => {
    const mapped = mapping[item]
    if (mapped && mapped !== item) {
      changed = true
      return mapped
    }
    return item
  })
  return { changed, next }
}

async function updateProducts(db, products, mapping) {
  const _ = db.command
  let updatedCount = 0

  for (const product of products) {
    const { changed, next } = remapImages(product.images, mapping)
    const hasResidualDataField = Boolean(product && product.data && typeof product.data === 'object')
    if (!changed && !hasResidualDataField) continue

    await db.collection('products').doc(product._id).update({
      images: changed ? next : (Array.isArray(product.images) ? product.images : []),
      data: _.remove()
    })
    updatedCount += 1
    console.log(`已更新商品图片: ${product.name}`)
  }

  return updatedCount
}

function writeManifest(mapping) {
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(mapping, null, 2)}\n`, 'utf8')
}

async function main() {
  const envId = resolveEnvId()
  const app = createCloudbaseApp(envId)
  const db = app.database()
  const imageEntries = listLocalImages()

  if (!imageEntries.length) {
    console.log('未发现可迁移的商品图片')
    return
  }

  console.log(`开始上传 ${imageEntries.length} 张商品图片到 ${envId}`)
  const mapping = await uploadImages(app, imageEntries)
  writeManifest(mapping)
  console.log(`已生成图片映射文件: ${path.relative(PROJECT_ROOT, MANIFEST_PATH)}`)

  const products = await listAllProducts(db)
  const updatedCount = await updateProducts(db, products, mapping)

  console.log('迁移完成')
  console.log(JSON.stringify({
    envId,
    uploadedCount: imageEntries.length,
    updatedProductCount: updatedCount,
    manifestPath: path.relative(PROJECT_ROOT, MANIFEST_PATH)
  }, null, 2))
}

main().catch(error => {
  console.error('迁移失败:', error)
  process.exit(1)
})
