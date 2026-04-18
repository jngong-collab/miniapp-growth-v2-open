const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const { isAuthorizedInternalCall } = require('../payApi/internal-auth')
const { visibleProductsData, retainedFissionProduct, packagesData } = require('../common/catalog-data.js')

function isEnvEnabled(envValue) {
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(String(envValue || '').trim().toLowerCase())
}

function isTmpDbFixEnabled(env = process.env) {
  return isEnvEnabled(env.TMP_DB_FIX_ENABLED)
}

function isControlledTmpDbFixRequest(event) {
  return !!event
    && event.action === 'syncCatalog'
    && event.confirm === 'SYNC_CATALOG'
}

exports.main = async (event) => {
  if (!isTmpDbFixEnabled()) {
    return { code: 403, msg: 'tmpDbFix 未启用' }
  }

  const wxContext = cloud.getWXContext()
  if (wxContext && wxContext.OPENID) {
    return { code: 403, msg: 'tmpDbFix 仅允许受控服务调用' }
  }

  if (!isControlledTmpDbFixRequest(event)) {
    return { code: 403, msg: 'tmpDbFix 仅允许受控调用，请提供 action=syncCatalog 与 confirm=SYNC_CATALOG' }
  }

  if (!isAuthorizedInternalCall(event)) {
    return { code: 403, msg: '无权访问' }
  }
  try {
    const allProducts = [...visibleProductsData, retainedFissionProduct]
    let updated = 0
    let inserted = 0

    for (const product of allProducts) {
      const existing = await db.collection('products')
        .where({ name: product.name })
        .limit(1)
        .get()

      const now = db.serverDate()
      const payload = { ...product }

      if (existing.data.length > 0) {
        const docId = existing.data[0]._id
        delete payload._id
        delete payload.createdAt
        payload.updatedAt = now
        await db.collection('products').doc(docId).update({ data: payload })
        updated++
      } else {
        payload.createdAt = now
        payload.updatedAt = now
        await db.collection('products').add({ data: payload })
        inserted++
      }
    }

    // 删除已下架的商品和套餐
    const allNames = allProducts.map(p => p.name)
    const staleProducts = await db.collection('products').where({
      name: db.command.nin(allNames)
    }).get()
    let deleted = 0
    let pkgDeleted = 0
    for (const p of staleProducts.data) {
      // 检查是否有历史订单引用，避免破坏订单数据完整性
      const orderItemsRef = await db.collection('order_items').where({ productId: p._id }).limit(1).get()
      if (orderItemsRef.data.length > 0) {
        // 有历史订单引用，标记为归档而非物理删除
        await db.collection('products').doc(p._id).update({
          data: { status: 'archived', updatedAt: db.serverDate() }
        })
      } else {
        await db.collection('products').doc(p._id).remove()
        deleted++
      }
      // 同步删除对应套餐明细
      const stalePkgs = await db.collection('packages').where({ productId: p._id }).get()
      for (const sp of stalePkgs.data) {
        await db.collection('packages').doc(sp._id).remove()
        pkgDeleted++
      }
    }

    // 同步套餐明细
    let pkgUpdated = 0
    let pkgInserted = 0
    for (const pkg of packagesData) {
      const productRes = await db.collection('products')
        .where({ name: pkg.productName, type: 'package' })
        .limit(1)
        .get()
      if (productRes.data.length === 0) continue

      const productId = productRes.data[0]._id
      const existingPkg = await db.collection('packages')
        .where({ productId })
        .limit(1)
        .get()

      const payload = { productId, items: pkg.items, validDays: pkg.validDays }
      if (existingPkg.data.length > 0) {
        await db.collection('packages').doc(existingPkg.data[0]._id).update({ data: payload })
        pkgUpdated++
      } else {
        await db.collection('packages').add({ data: { ...payload, createdAt: db.serverDate() } })
        pkgInserted++
      }
    }

    return {
      code: 0,
      msg: `商品同步：更新 ${updated} 条，新增 ${inserted} 条，删除 ${deleted} 条，总计 ${allProducts.length} 条；套餐明细同步：更新 ${pkgUpdated} 条，新增 ${pkgInserted} 条，删除 ${pkgDeleted} 条`,
      data: { updated, inserted, deleted, total: allProducts.length, pkgUpdated, pkgInserted, pkgDeleted }
    }
  } catch (err) {
    return { code: -1, msg: err.message, stack: err.stack }
  }
}
