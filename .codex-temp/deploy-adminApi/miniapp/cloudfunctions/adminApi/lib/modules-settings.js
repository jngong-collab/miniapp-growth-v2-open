const { db } = require('./context')
const http = require('node:http')
const https = require('node:https')
const tcb = require('@cloudbase/node-sdk')
const {
  getAccessStoreId,
  safeGetById,
  safeGetFirstByStore,
  safeList,
  writeAuditLog
} = require('./data')
const { sanitizeStore, splitPlainList } = require('./helpers')

const SECRET_MASK = '••••••••'

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

async function requestRemoteJson(url, options = {}) {
  const parsedUrl = new URL(url)
  const transport = parsedUrl.protocol === 'https:' ? https : http
  const method = options.method || 'GET'
  const body = typeof options.body === 'string' ? options.body : ''
  const headers = options.headers || {}
  const timeout = Number(options.timeout || 15000)

  return new Promise((resolve, reject) => {
    const request = transport.request({
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: `${parsedUrl.pathname}${parsedUrl.search || ''}`,
      method,
      headers
    }, response => {
      let responseBody = ''
      response.setEncoding('utf8')
      response.on('data', chunk => {
        responseBody += chunk
      })
      response.on('end', () => {
        let payload = null
        if (responseBody.trim()) {
          try {
            payload = JSON.parse(responseBody)
          } catch (error) {
            if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
              reject(new Error(extractRemoteErrorMessage(null, responseBody, response.statusCode)))
              return
            }
            reject(new Error(`接口返回了无效 JSON：${responseBody.slice(0, 200)}`))
            return
          }
        } else {
          payload = {}
        }

        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
          const message = extractRemoteErrorMessage(payload, responseBody, response.statusCode)
          reject(new Error(message))
          return
        }

        resolve(payload)
      })
    })

    request.on('error', error => {
      reject(error)
    })
    request.setTimeout(timeout, () => {
      request.destroy(new Error('接口请求超时'))
    })

    if (body) {
      request.write(body)
    }
    request.end()
  })
}

function extractRemoteErrorMessage(payload, rawBody, statusCode) {
  const payloadMessage = payload && typeof payload === 'object'
    ? trimText(
      payload.msg ||
      payload.message ||
      (payload.error && (payload.error.message || payload.error.code)) ||
      ''
    )
    : ''
  const rawMessage = typeof rawBody === 'string' ? rawBody.slice(0, 160).trim() : ''
  return payloadMessage || rawMessage || `HTTP ${statusCode || 500}`
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
    if (key === secretField && (!value || value === SECRET_MASK)) {
      return
    }
    next[key] = typeof value === 'string' ? value.trim() : value
  })
  return next
}

function trimText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeMaskedSecret(value) {
  const next = trimText(value)
  if (!next || next === SECRET_MASK) {
    return undefined
  }
  return next
}

function buildDefaultAiConfig() {
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

function buildDefaultPayConfig() {
  return {
    enabled: false,
    mchId: '',
    notifyUrl: '',
    apiV3Key: '',
    certSerialNo: '',
    privateKey: '',
    privateKeyFileName: '',
    certificatePem: '',
    certificateFileName: '',
    apiV3KeyConfigured: false,
    privateKeyConfigured: false,
    certificateConfigured: false
  }
}

function normalizePayConfigPayload(payload) {
  const source = payload && typeof payload === 'object' ? payload : {}
  const next = {
    enabled: source.enabled === true,
    mchId: trimText(source.mchId),
    notifyUrl: trimText(source.notifyUrl),
    certSerialNo: trimText(source.certSerialNo),
    privateKeyFileName: trimText(source.privateKeyFileName),
    certificateFileName: trimText(source.certificateFileName)
  }

  const apiV3Key = normalizeMaskedSecret(source.apiV3Key)
  const privateKey = normalizeMaskedSecret(source.privateKey)
  const certificatePem = normalizeMaskedSecret(source.certificatePem)

  if (apiV3Key !== undefined) {
    next.apiV3Key = apiV3Key
  }
  if (privateKey !== undefined) {
    next.privateKey = privateKey
  }
  if (certificatePem !== undefined) {
    next.certificatePem = certificatePem
  }

  return next
}

function maskPayConfigSecrets(payConfig) {
  if (!payConfig) {
    return buildDefaultPayConfig()
  }

  return {
    ...buildDefaultPayConfig(),
    ...payConfig,
    apiV3Key: payConfig.apiV3Key ? SECRET_MASK : '',
    apiV3KeyConfigured: Boolean(payConfig.apiV3Key),
    privateKeyConfigured: Boolean(payConfig.privateKey),
    certificateConfigured: Boolean(payConfig.certificatePem)
  }
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
    return buildDefaultAiConfig()
  }
  return {
    ...buildDefaultAiConfig(),
    ...aiConfig,
    apiKey: aiConfig.apiKey ? '••••••••' : '',
    reviewConfig: normalizeReviewConfig(aiConfig.reviewConfig)
  }
}

function buildAiAuthHeaders(apiKey, extraHeaders = {}) {
  const next = {
    Accept: 'application/json',
    'User-Agent': 'liebian-admin/1.0',
    ...extraHeaders
  }
  const token = trimText(apiKey)
  if (token) {
    next.Authorization = `Bearer ${token}`
  }
  return next
}

function buildAbsoluteUrls(parsedUrl, paths) {
  return Array.from(new Set(paths
    .filter(Boolean)
    .map(path => new URL(path, `${parsedUrl.protocol}//${parsedUrl.host}`).toString())
  ))
}

function buildAiEndpointCandidates(apiUrl) {
  const parsedUrl = new URL(trimText(apiUrl))
  const pathname = (() => {
    const next = trimText(parsedUrl.pathname || '/')
    if (!next) return '/'
    if (next !== '/' && next.endsWith('/')) return next.slice(0, -1)
    return next
  })()

  let chatPaths = []
  let modelPaths = []
  let imagePaths = []

  if (pathname === '/' || pathname === '') {
    chatPaths = ['/v1/chat/completions', '/chat/completions']
    modelPaths = ['/v1/models', '/models']
    imagePaths = ['/v1/images/generations', '/images/generations']
  } else if (pathname.endsWith('/chat/completions')) {
    const prefix = pathname.slice(0, -'/chat/completions'.length)
    chatPaths = [pathname]
    modelPaths = [`${prefix || ''}/models`, '/v1/models', '/models']
    imagePaths = [`${prefix || ''}/images/generations`, '/v1/images/generations', '/images/generations']
  } else if (pathname.endsWith('/models')) {
    const prefix = pathname.slice(0, -'/models'.length)
    chatPaths = [`${prefix || ''}/chat/completions`, '/v1/chat/completions', '/chat/completions']
    modelPaths = [pathname]
    imagePaths = [`${prefix || ''}/images/generations`, '/v1/images/generations', '/images/generations']
  } else if (pathname.endsWith('/images/generations')) {
    const prefix = pathname.slice(0, -'/images/generations'.length)
    chatPaths = [`${prefix || ''}/chat/completions`, '/v1/chat/completions', '/chat/completions']
    modelPaths = [`${prefix || ''}/models`, '/v1/models', '/models']
    imagePaths = [pathname]
  } else if (pathname.endsWith('/v1')) {
    chatPaths = [`${pathname}/chat/completions`]
    modelPaths = [`${pathname}/models`]
    imagePaths = [`${pathname}/images/generations`]
  } else {
    const lastSlashIndex = pathname.lastIndexOf('/')
    const parentPath = lastSlashIndex > 0 ? pathname.slice(0, lastSlashIndex) : ''
    chatPaths = [pathname]
    modelPaths = [parentPath ? `${parentPath}/models` : '/v1/models', '/v1/models', '/models']
    imagePaths = [parentPath ? `${parentPath}/images/generations` : '/v1/images/generations', '/v1/images/generations', '/images/generations']
  }

  return {
    chatUrls: buildAbsoluteUrls(parsedUrl, chatPaths),
    modelUrls: buildAbsoluteUrls(parsedUrl, modelPaths),
    imageUrls: buildAbsoluteUrls(parsedUrl, imagePaths)
  }
}

function normalizeAiModelList(payload) {
  const sourceList = Array.isArray(payload)
    ? payload
    : Array.isArray(payload && payload.data)
      ? payload.data
      : Array.isArray(payload && payload.models)
        ? payload.models
        : []

  return Array.from(new Set(sourceList
    .map(item => {
      if (typeof item === 'string') return trimText(item)
      if (!item || typeof item !== 'object') return ''
      return trimText(item.id || item.model || item.name || item.value || '')
    })
    .filter(Boolean)
  ))
}

function extractAiReply(payload) {
  const primaryChoice = payload && Array.isArray(payload.choices) ? payload.choices[0] : null
  const messageContent = primaryChoice && primaryChoice.message ? primaryChoice.message.content : ''

  if (typeof messageContent === 'string') {
    return messageContent.trim()
  }
  if (Array.isArray(messageContent)) {
    return messageContent
      .map(item => {
        if (typeof item === 'string') return item.trim()
        if (item && typeof item.text === 'string') return item.text.trim()
        return ''
      })
      .filter(Boolean)
      .join('\n')
      .trim()
  }
  if (primaryChoice && typeof primaryChoice.text === 'string') {
    return primaryChoice.text.trim()
  }
  if (typeof payload.output_text === 'string') {
    return payload.output_text.trim()
  }
  return ''
}

async function resolveAiConfigForAction(access, event) {
  const storeId = getAccessStoreId(access)
  const existing = await safeGetFirstByStore('ai_config', storeId)
  const payload = normalizeAiConfigPayload(event.payload || {})
  const merged = {
    ...buildDefaultAiConfig(),
    ...(existing || {}),
    ...payload
  }

  merged.apiUrl = trimText(merged.apiUrl)
  merged.apiKey = trimText(merged.apiKey)
  merged.model = trimText(merged.model)
  merged.systemPrompt = trimText(merged.systemPrompt)
  merged.reviewConfig = normalizeReviewConfig(merged.reviewConfig)

  return {
    storeId,
    existing,
    aiConfig: merged
  }
}

async function fetchAiModelsFromConfig(aiConfig) {
  const { modelUrls } = buildAiEndpointCandidates(aiConfig.apiUrl)
  let lastError = null

  for (const requestUrl of modelUrls) {
    try {
      const payload = await requestRemoteJson(requestUrl, {
        method: 'GET',
        headers: buildAiAuthHeaders(aiConfig.apiKey),
        timeout: 15000
      })
      const models = normalizeAiModelList(payload)
      if (models.length > 0) {
        return { models, requestUrl }
      }
      lastError = new Error('接口已响应，但没有返回可用模型')
    } catch (error) {
      lastError = error
    }
  }

  throw lastError || new Error('模型列表拉取失败')
}

async function runAiConnectionTest(aiConfig) {
  const { chatUrls } = buildAiEndpointCandidates(aiConfig.apiUrl)
  const requestBody = JSON.stringify({
    model: aiConfig.model,
    messages: [
      { role: 'system', content: '你是接口联调助手。' },
      { role: 'user', content: '请只回复“连接成功”。' }
    ],
    max_tokens: 32
  })
  let lastError = null

  for (const requestUrl of chatUrls) {
    try {
      const payload = await requestRemoteJson(requestUrl, {
        method: 'POST',
        headers: buildAiAuthHeaders(aiConfig.apiKey, {
          'Content-Type': 'application/json'
        }),
        body: requestBody,
        timeout: 20000
      })
      const reply = extractAiReply(payload)
      if (!reply) {
        throw new Error('接口已响应，但没有返回可读取的回复内容')
      }
      return { reply, requestUrl }
    } catch (error) {
      lastError = error
    }
  }

  throw lastError || new Error('AI 接口测试失败')
}

function buildImageModelCandidates(aiConfig, event) {
  return Array.from(new Set([
    trimText(event.imageModel || (event.payload && event.payload.imageModel)),
    trimText(aiConfig.imageModel),
    'gemini-3-pro-image-preview',
    'gpt-image-1',
    trimText(aiConfig.model),
    ''
  ]))
}

function extractGeneratedImageSource(payload) {
  const candidates = []

  if (Array.isArray(payload && payload.data)) {
    candidates.push(...payload.data)
  }
  if (Array.isArray(payload && payload.images)) {
    candidates.push(...payload.images)
  }
  if (Array.isArray(payload && payload.result && payload.result.data)) {
    candidates.push(...payload.result.data)
  }

  const first = candidates[0]
  if (first && typeof first.url === 'string' && trimText(first.url)) {
    return {
      kind: 'url',
      value: trimText(first.url)
    }
  }

  const base64 = trimText(
    (first && (first.b64_json || first.base64 || first.b64)) ||
    payload?.b64_json ||
    payload?.base64 ||
    payload?.image_base64 ||
    ''
  )

  if (base64) {
    return {
      kind: 'base64',
      value: base64,
      mimeType: trimText((first && (first.mime_type || first.mimeType)) || payload?.mime_type || payload?.mimeType || '')
    }
  }

  return null
}

function inferImageExtension(sourceUrl, contentType) {
  const normalizedType = trimText(contentType).toLowerCase()
  if (normalizedType.includes('png')) return '.png'
  if (normalizedType.includes('webp')) return '.webp'
  if (normalizedType.includes('gif')) return '.gif'
  if (normalizedType.includes('jpeg') || normalizedType.includes('jpg')) return '.jpg'

  const pathname = (() => {
    try {
      return new URL(sourceUrl).pathname.toLowerCase()
    } catch (error) {
      return ''
    }
  })()

  if (pathname.endsWith('.png')) return '.png'
  if (pathname.endsWith('.webp')) return '.webp'
  if (pathname.endsWith('.gif')) return '.gif'
  if (pathname.endsWith('.jpeg') || pathname.endsWith('.jpg')) return '.jpg'
  return '.png'
}

async function downloadRemoteBinary(url, depth = 0) {
  const parsedUrl = new URL(url)
  const transport = parsedUrl.protocol === 'https:' ? https : http

  return new Promise((resolve, reject) => {
    const request = transport.request({
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: `${parsedUrl.pathname}${parsedUrl.search || ''}`,
      method: 'GET',
      headers: {
        'User-Agent': 'liebian-admin/1.0'
      }
    }, response => {
      const statusCode = response.statusCode || 500
      const location = trimText(response.headers.location)

      if (statusCode >= 300 && statusCode < 400 && location) {
        response.resume()
        if (depth >= 3) {
          reject(new Error('下载生成图片时跳转次数过多'))
          return
        }
        const redirectUrl = new URL(location, parsedUrl).toString()
        resolve(downloadRemoteBinary(redirectUrl, depth + 1))
        return
      }

      if (statusCode < 200 || statusCode >= 300) {
        response.resume()
        reject(new Error(`下载生成图片失败（HTTP ${statusCode}）`))
        return
      }

      const chunks = []
      response.on('data', chunk => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      })
      response.on('end', () => {
        resolve({
          buffer: Buffer.concat(chunks),
          contentType: trimText(response.headers['content-type'])
        })
      })
    })

    request.on('error', error => {
      reject(error)
    })
    request.setTimeout(30000, () => {
      request.destroy(new Error('下载生成图片超时'))
    })
    request.end()
  })
}

async function uploadGeneratedImage(fileBuffer, extension) {
  const envId = trimText(process.env.TCB_ENV) || trimText(process.env.SCF_NAMESPACE) || trimText(process.env.TCB_ENV_ID)
  if (!envId) {
    throw new Error('云函数未获取到环境信息，无法上传生成图片')
  }

  const app = tcb.init({ env: envId })
  const cloudPath = `products/generated/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extension || '.png'}`
  const uploadResult = await app.uploadFile({
    cloudPath,
    fileContent: fileBuffer
  })
  const fileID = trimText(uploadResult && uploadResult.fileID)
  if (!fileID) {
    throw new Error('生成图片上传成功但未返回云存储地址')
  }
  return { cloudPath, fileID }
}

async function generateImage(access, event) {
  const { aiConfig, storeId } = await resolveAiConfigForAction(access, event)
  const prompt = trimText(event.prompt || (event.payload && event.payload.prompt))

  if (!prompt) {
    return { code: -1, msg: '请先提供主图描述' }
  }
  if (!aiConfig.apiUrl) {
    return { code: -1, msg: '请先在系统设置里填写 AI 接口地址' }
  }
  if (!aiConfig.apiKey) {
    return { code: -1, msg: '请先在系统设置里填写 AI API Key' }
  }

  const { imageUrls } = buildAiEndpointCandidates(aiConfig.apiUrl)
  const modelCandidates = buildImageModelCandidates(aiConfig, event)
  let lastError = null

  for (const requestUrl of imageUrls) {
    for (const candidateModel of modelCandidates) {
      const requestBody = {
        prompt,
        n: 1,
        size: '1024x1024'
      }
      if (candidateModel) {
        requestBody.model = candidateModel
      }

      try {
        const payload = await requestRemoteJson(requestUrl, {
          method: 'POST',
          headers: buildAiAuthHeaders(aiConfig.apiKey, {
            'Content-Type': 'application/json'
          }),
          body: JSON.stringify(requestBody),
          timeout: 30000
        })

        const imageSource = extractGeneratedImageSource(payload)
        if (!imageSource) {
          throw new Error('接口已响应，但没有返回可用图片')
        }

        let fileBuffer = null
        let extension = '.png'

        if (imageSource.kind === 'url') {
          const downloaded = await downloadRemoteBinary(imageSource.value)
          fileBuffer = downloaded.buffer
          extension = inferImageExtension(imageSource.value, downloaded.contentType)
        } else {
          fileBuffer = Buffer.from(imageSource.value, 'base64')
          extension = inferImageExtension('', imageSource.mimeType)
        }

        if (!fileBuffer || !fileBuffer.length) {
          throw new Error('生成图片为空，无法上传')
        }

        const uploaded = await uploadGeneratedImage(fileBuffer, extension)

        await writeAuditLog(access, {
          action: 'settings.generateImage',
          module: 'settings',
          targetType: 'ai_image',
          targetId: storeId,
          summary: '生成商品主图',
          detail: {
            requestUrl,
            model: candidateModel || '(provider default)',
            promptLength: prompt.length,
            cloudPath: uploaded.cloudPath
          }
        })

        return {
          code: 0,
          data: { url: uploaded.fileID },
          msg: '主图生成成功'
        }
      } catch (error) {
        lastError = error
      }
    }
  }

  throw lastError || new Error('主图生成失败，请检查 AI 图片接口配置')
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
      payConfig: maskPayConfigSecrets(payConfig),
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
  const payload = normalizePayConfigPayload(event.payload || {})
  const existing = await safeGetFirstByStore('pay_config', storeId)
  const merged = {
    ...(existing || buildDefaultPayConfig()),
    ...payload
  }

  if (merged.enabled) {
    if (!merged.mchId) {
      return { code: -1, msg: '请先填写商户号' }
    }
    if (!merged.apiV3Key) {
      return { code: -1, msg: '请先填写 API_V3_KEY' }
    }
    if (!merged.certSerialNo) {
      return { code: -1, msg: '请先填写证书序列号' }
    }
    if (!merged.privateKey) {
      return { code: -1, msg: '请先导入或粘贴 apiclient_key.pem 私钥内容' }
    }
    if (!merged.certificatePem) {
      return { code: -1, msg: '请先导入或粘贴 apiclient_cert.pem 证书内容' }
    }
  }

  const data = {
    enabled: merged.enabled === true,
    mchId: trimText(merged.mchId),
    notifyUrl: trimText(merged.notifyUrl),
    apiV3Key: trimText(merged.apiV3Key),
    certSerialNo: trimText(merged.certSerialNo),
    privateKey: trimText(merged.privateKey),
    privateKeyFileName: trimText(merged.privateKeyFileName),
    certificatePem: trimText(merged.certificatePem),
    certificateFileName: trimText(merged.certificateFileName),
    storeId,
    updatedAt: db.serverDate()
  }

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
    data: maskPayConfigSecrets(updated),
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

async function fetchAiModels(access, event) {
  const { aiConfig, storeId } = await resolveAiConfigForAction(access, event)
  if (!aiConfig.apiUrl) {
    return { code: -1, msg: '请先填写 AI 接口地址' }
  }

  const result = await fetchAiModelsFromConfig(aiConfig)
  await writeAuditLog(access, {
    action: 'settings.fetchAiModels',
    module: 'settings',
    targetType: 'ai_config',
    targetId: storeId,
    summary: '拉取 AI 模型列表',
    detail: {
      apiUrl: aiConfig.apiUrl,
      requestUrl: result.requestUrl,
      modelCount: result.models.length
    }
  })

  return {
    code: 0,
    data: {
      models: result.models,
      selectedModel: aiConfig.model && result.models.includes(aiConfig.model) ? aiConfig.model : (result.models[0] || ''),
      requestUrl: result.requestUrl
    },
    msg: `已拉取 ${result.models.length} 个模型`
  }
}

async function testAiConfig(access, event) {
  const { aiConfig, storeId } = await resolveAiConfigForAction(access, event)
  if (!aiConfig.apiUrl) {
    return { code: -1, msg: '请先填写 AI 接口地址' }
  }

  const result = await fetchAiModelsFromConfig(aiConfig)
  const selectedModel = aiConfig.model && result.models.includes(aiConfig.model) ? aiConfig.model : (result.models[0] || '')

  if (!selectedModel) {
    return { code: -1, msg: '接口没有返回可用模型，请先检查地址或点击“拉取模型”' }
  }

  await writeAuditLog(access, {
    action: 'settings.testAiConfig',
    module: 'settings',
    targetType: 'ai_config',
    targetId: storeId,
    summary: '测试 AI 模型接口返回',
    detail: {
      apiUrl: aiConfig.apiUrl,
      requestUrl: result.requestUrl,
      modelCount: result.models.length,
      selectedModel
    }
  })

  return {
    code: 0,
    data: {
      models: result.models,
      selectedModel,
      requestUrl: result.requestUrl
    },
    msg: 'AI 接口测试通过'
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
  fetchAiModels,
  testAiConfig,
  generateImage,
  updateNotificationConfig,
  getSystemHealth,
  geocodeAddress
}
