const { db } = require('./context')
const https = require('node:https')
const {
  getAccessStoreId,
  safeGetById,
  safeGetFirstByStore,
  safeList,
  writeAuditLog
} = require('./data')
const { sanitizeStore, splitPlainList } = require('./helpers')

async function requestJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'liebian-admin/1.0',
        ...headers
      }
    }, response => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', chunk => {
        body += chunk
      })
      response.on('end', () => {
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`HTTP ${response.statusCode || 500}`))
          return
        }
        try {
          resolve(JSON.parse(body))
        } catch (error) {
          reject(new Error('地址解析服务返回了无效数据'))
        }
      })
    })
    request.on('error', error => {
      reject(error)
    })
    request.setTimeout(10000, () => {
      request.destroy(new Error('地址解析请求超时'))
    })
    request.end()
  })
}

async function geocodeWithTencent(address, key) {
  const payload = await requestJson(
    `https://apis.map.qq.com/ws/geocoder/v1/?address=${encodeURIComponent(address)}&key=${encodeURIComponent(key)}`
  )
  if (payload.status !== 0 || !payload.result || !payload.result.location) {
    throw new Error(payload.message || '腾讯地图地址解析失败')
  }
  return {
    latitude: Number(payload.result.location.lat),
    longitude: Number(payload.result.location.lng),
    formattedAddress: payload.result.address || address,
    provider: 'tencent'
  }
}

async function geocodeWithAmap(address, key) {
  const payload = await requestJson(
    `https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(address)}&key=${encodeURIComponent(key)}`
  )
  const location = payload.geocodes && payload.geocodes[0] && payload.geocodes[0].location
  if (payload.status !== '1' || !location) {
    throw new Error(payload.info || '高德地址解析失败')
  }
  const [longitude, latitude] = String(location).split(',').map(Number)
  return {
    latitude,
    longitude,
    formattedAddress: payload.geocodes[0].formatted_address || address,
    provider: 'amap'
  }
}

async function geocodeWithNominatim(address) {
  const payload = await requestJson(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(address)}`,
    {
      Referer: 'https://liebian.nv2.cn/'
    }
  )
  const item = Array.isArray(payload) ? payload[0] : null
  if (!item) {
    throw new Error('未找到匹配地址')
  }
  return {
    latitude: Number(item.lat),
    longitude: Number(item.lon),
    formattedAddress: item.display_name || address,
    provider: 'nominatim'
  }
}

async function resolveGeocode(address) {
  const qqMapKey = process.env.QQMAP_KEY || process.env.TENCENT_MAP_KEY || ''
  const amapKey = process.env.AMAP_KEY || ''
  const providers = []

  if (qqMapKey) {
    providers.push(() => geocodeWithTencent(address, qqMapKey))
  }
  if (amapKey) {
    providers.push(() => geocodeWithAmap(address, amapKey))
  }
  providers.push(() => geocodeWithNominatim(address))

  let lastError = null
  for (const provider of providers) {
    try {
      return await provider()
    } catch (error) {
      lastError = error
    }
  }

  throw lastError || new Error('地址解析失败，请检查地址是否完整')
}

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

function normalizeReviewConfig(payload) {
  const source = payload && typeof payload === 'object' ? payload : {}
  const normalizeText = key => String(source[key] || '').trim()
  return {
    enabled: source.enabled === true,
    entryTitle: normalizeText('entryTitle') || '宝宝日常',
    pageTitle: normalizeText('pageTitle') || '宝宝日常',
    historyTitle: normalizeText('historyTitle') || '成长记录',
    reportTitle: normalizeText('reportTitle') || '记录详情',
    submitText: normalizeText('submitText') || '保存本次记录',
    shareTitle: normalizeText('shareTitle') || '记录宝宝健康每一天',
    emptyText: normalizeText('emptyText') || '暂无成长记录',
    listTagText: normalizeText('listTagText') || '待AI分析',
    safeBannerUrl: normalizeText('safeBannerUrl') || '/assets/images/baby-massage.png',
    safeShareImageUrl: normalizeText('safeShareImageUrl') || '/assets/images/baby-massage.png',
    hideHistoryAiRecords: source.hideHistoryAiRecords !== false,
    allowReanalyzeAfterReview: source.allowReanalyzeAfterReview !== false
  }
}

function normalizeAiConfigPayload(payload) {
  const source = normalizeSecretPayload(payload || {}, 'apiKey')
  const next = { ...source }
  if (Object.prototype.hasOwnProperty.call(source, 'enabled')) {
    next.enabled = source.enabled === true
  }
  if (Object.prototype.hasOwnProperty.call(source, 'dailyLimit')) {
    next.dailyLimit = source.dailyLimit === '' || source.dailyLimit === null || source.dailyLimit === undefined
      ? 0
      : Number(source.dailyLimit)
  }
  if (Object.prototype.hasOwnProperty.call(source, 'userDailyLimit')) {
    next.userDailyLimit = source.userDailyLimit === '' || source.userDailyLimit === null || source.userDailyLimit === undefined
      ? 0
      : Number(source.userDailyLimit)
  }
  next.reviewConfig = normalizeReviewConfig(source.reviewConfig)
  return next
}

function maskAiConfigSecrets(aiConfig) {
  if (!aiConfig) {
    return {
      enabled: false,
      apiUrl: '',
      apiKey: '',
      model: '',
      dailyLimit: 0,
      userDailyLimit: 0,
      systemPrompt: '',
      reviewConfig: normalizeReviewConfig({})
    }
  }
  return {
    ...aiConfig,
    apiKey: aiConfig.apiKey ? '••••••••' : '',
    reviewConfig: normalizeReviewConfig(aiConfig.reviewConfig)
  }
}

async function getSettings(access) {
  const storeId = getAccessStoreId(access)
  const [storeInfo, aiConfig, payConfig, adminAccounts, notificationConfig] = await Promise.all([
    safeGetById('stores', storeId),
    safeGetFirstByStore('ai_config', storeId),
    safeGetFirstByStore('pay_config', storeId),
    safeList('admin_accounts', { storeId }, { orderBy: ['createdAt', 'desc'], limit: 50 }),
    safeGetFirstByStore('notification_settings', storeId)
  ])

  return {
    code: 0,
    data: {
      storeInfo: storeInfo ? sanitizeStore(storeInfo) : null,
      aiConfig: maskAiConfigSecrets(aiConfig),
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
  const storeId = getAccessStoreId(access)
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
  const storeId = getAccessStoreId(access)
  const payload = normalizeSecretPayload(event.payload || {}, 'mchKey')
  const existing = await safeGetFirstByStore('pay_config', storeId)
  const data = { ...payload, storeId, updatedAt: db.serverDate() }
  if (existing) {
    await db.collection('pay_config').doc(existing._id).update({ data })
  } else {
    await db.collection('pay_config').add({ data: { ...data, createdAt: db.serverDate() } })
  }
  const updated = await safeGetFirstByStore('pay_config', storeId)
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
  const storeId = getAccessStoreId(access)
  const payload = normalizeAiConfigPayload(event.payload || {})
  const existing = await safeGetFirstByStore('ai_config', storeId)
  const data = { ...payload, storeId, updatedAt: db.serverDate() }
  if (existing) {
    await db.collection('ai_config').doc(existing._id).update({ data })
  } else {
    await db.collection('ai_config').add({ data: { ...data, createdAt: db.serverDate() } })
  }
  const updated = await safeGetFirstByStore('ai_config', storeId)
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
    data: maskAiConfigSecrets(updated),
    msg: 'AI 配置已更新'
  }
}

async function updateNotificationConfig(access, event) {
  const payload = event.payload || {}
  const storeId = getAccessStoreId(access)
  const existing = await safeGetFirstByStore('notification_settings', storeId)
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
  const updated = await safeGetFirstByStore('notification_settings', storeId)
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

async function geocodeAddress(access, event) {
  const address = String(event.address || (event.payload && event.payload.address) || '').trim()
  if (!address) {
    return { code: -1, msg: '请先输入门店地址' }
  }

  const result = await resolveGeocode(address)
  await writeAuditLog(access, {
    action: 'settings.geocodeAddress',
    module: 'settings',
    targetType: 'store',
    targetId: getAccessStoreId(access),
    summary: '解析门店地址坐标',
    detail: {
      address,
      latitude: result.latitude,
      longitude: result.longitude,
      provider: result.provider
    }
  })

  return {
    code: 0,
    data: result,
    msg: '地址解析成功'
  }
}

module.exports = {
  getSettings,
  updateStore,
  updatePayConfig,
  updateAiConfig,
  updateNotificationConfig,
  getSystemHealth,
  geocodeAddress
}
