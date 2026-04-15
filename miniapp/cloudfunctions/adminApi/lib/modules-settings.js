const { db } = require('./context')
const { safeGetById, safeGetFirst, safeList, writeAuditLog } = require('./data')
const { sanitizeStore, splitPlainList } = require('./helpers')

function normalizeStorePayload(payload) {
  return {
    name: String(payload.name || '').trim(),
    phone: String(payload.phone || '').trim(),
    address: String(payload.address || '').trim(),
    latitude: payload.latitude === '' || payload.latitude === undefined ? null : Number(payload.latitude),
    longitude: payload.longitude === '' || payload.longitude === undefined ? null : Number(payload.longitude),
    description: String(payload.description || '').trim(),
    logo: String(payload.logo || '').trim(),
    banners: Array.isArray(payload.banners) ? payload.banners.filter(Boolean) : splitPlainList(payload.banners)
  }
}

function normalizeSecretPayload(payload, secretField) {
  const next = {}
  Object.keys(payload || {}).forEach(key => {
    const value = payload[key]
    if (key === secretField && (!value || value === '••••••••')) {
      return
    }
    next[key] = typeof value === 'string' ? value.trim() : value
  })
  return next
}

async function getSettings(access) {
  const storeId = access.account.storeId || access.store._id
  const [storeInfo, aiConfig, payConfig, adminAccounts, notificationConfig] = await Promise.all([
    safeGetById('stores', storeId),
    safeGetFirst('ai_config', {}),
    safeGetFirst('pay_config', {}),
    safeList('admin_accounts', { storeId }, { orderBy: ['createdAt', 'desc'], limit: 50 }),
    safeGetFirst('notification_settings', { storeId })
  ])

  return {
    code: 0,
    data: {
      storeInfo: storeInfo ? sanitizeStore(storeInfo) : null,
      aiConfig: aiConfig ? { ...aiConfig, apiKey: aiConfig.apiKey ? '••••••••' : '' } : null,
      payConfig: payConfig ? { ...payConfig, mchKey: payConfig.mchKey ? '••••••••' : '' } : null,
      adminAccounts,
      notificationConfig: notificationConfig || {
        orderNotifyEnabled: true,
        refundNotifyEnabled: true,
        followupNotifyEnabled: true,
        notifyChannels: ['sms'],
        adminPhones: []
      }
    }
  }
}

async function updateStore(access, event) {
  const payload = normalizeStorePayload(event.payload || {})
  const storeId = access.account.storeId || access.store._id
  const before = await safeGetById('stores', storeId)
  await db.collection('stores').doc(storeId).update({
    data: { ...payload, updatedAt: db.serverDate() }
  })
  const updated = await safeGetById('stores', storeId)
  await writeAuditLog(access, {
    action: 'settings.updateStore',
    module: 'settings',
    targetType: 'store',
    targetId: storeId,
    summary: '更新门店基础信息',
    detail: { before: sanitizeStore(before), after: sanitizeStore(updated) }
  })
  return { code: 0, data: sanitizeStore(updated), msg: '门店信息已更新' }
}

async function updatePayConfig(access, event) {
  const payload = normalizeSecretPayload(event.payload || {}, 'mchKey')
  const existing = await safeGetFirst('pay_config', {})
  const data = { ...payload, updatedAt: db.serverDate() }
  if (existing) {
    await db.collection('pay_config').doc(existing._id).update({ data })
  } else {
    await db.collection('pay_config').add({ data: { ...data, createdAt: db.serverDate() } })
  }
  const updated = await safeGetFirst('pay_config', {})
  await writeAuditLog(access, {
    action: 'settings.updatePayConfig',
    module: 'settings',
    targetType: 'pay_config',
    targetId: updated ? updated._id : '',
    summary: '更新支付配置',
    detail: { changedKeys: Object.keys(payload) }
  })
  return {
    code: 0,
    data: updated ? { ...updated, mchKey: updated.mchKey ? '••••••••' : '' } : null,
    msg: '支付配置已更新'
  }
}

async function updateAiConfig(access, event) {
  const payload = normalizeSecretPayload(event.payload || {}, 'apiKey')
  const existing = await safeGetFirst('ai_config', {})
  const data = { ...payload, updatedAt: db.serverDate() }
  if (existing) {
    await db.collection('ai_config').doc(existing._id).update({ data })
  } else {
    await db.collection('ai_config').add({ data: { ...data, createdAt: db.serverDate() } })
  }
  const updated = await safeGetFirst('ai_config', {})
  await writeAuditLog(access, {
    action: 'settings.updateAiConfig',
    module: 'settings',
    targetType: 'ai_config',
    targetId: updated ? updated._id : '',
    summary: '更新 AI 配置',
    detail: { changedKeys: Object.keys(payload) }
  })
  return {
    code: 0,
    data: updated ? { ...updated, apiKey: updated.apiKey ? '••••••••' : '' } : null,
    msg: 'AI 配置已更新'
  }
}

async function updateNotificationConfig(access, event) {
  const payload = event.payload || {}
  const storeId = getAccessStoreId(access)
  const existing = await safeGetFirst('notification_settings', { storeId })
  const data = {
    storeId,
    orderNotifyEnabled: payload.orderNotifyEnabled !== false,
    refundNotifyEnabled: payload.refundNotifyEnabled !== false,
    followupNotifyEnabled: payload.followupNotifyEnabled !== false,
    notifyChannels: Array.isArray(payload.notifyChannels) ? payload.notifyChannels : ['sms'],
    adminPhones: Array.isArray(payload.adminPhones) ? payload.adminPhones : [],
    updatedAt: db.serverDate()
  }
  if (existing) {
    await db.collection('notification_settings').doc(existing._id).update({ data })
  } else {
    await db.collection('notification_settings').add({ data: { ...data, createdAt: db.serverDate() } })
  }
  const updated = await safeGetFirst('notification_settings', { storeId })
  await writeAuditLog(access, {
    action: 'settings.updateNotificationConfig',
    module: 'settings',
    targetType: 'notification_settings',
    targetId: updated ? updated._id : '',
    summary: '更新通知配置',
    detail: { changedKeys: Object.keys(payload) }
  })
  return { code: 0, data: updated, msg: '通知配置已更新' }
}

async function getSystemHealth(access) {
  const storeId = getAccessStoreId(access)
  let database = 'ok'
  let storage = 'ok'
  try {
    await db.collection('stores').doc(storeId).get()
  } catch (e) {
    database = 'degraded'
  }
  return {
    code: 0,
    data: {
      adminApi: 'ok',
      database,
      storage,
      timestamp: db.serverDate()
    }
  }
}

module.exports = {
  getSettings,
  updateStore,
  updatePayConfig,
  updateAiConfig,
  updateNotificationConfig,
  getSystemHealth
}
