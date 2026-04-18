// app.js - 小儿推拿门店拓客小程序
const config = require('./config')
const { callCloud } = require('./utils/cloud-api')

const USER_INFO_STORAGE_KEY = 'userInfo'
const MEMBER_SESSION_KEY = 'miniapp_member_session'
const DEFAULT_PRIVACY_CONTRACT_NAME = '《用户隐私保护指引》'
const MEMBER_SESSION_DEFAULT = {
  openid: '',
  sessionToken: '',
  expiresAt: '',
  isLoggedIn: false
}

function getPathBase(path) {
  return (path || '').split('?')[0] || ''
}

function buildRedirectTarget(url) {
  if (!url) return ''
  const trimUrl = String(url).trim()
  return trimUrl.startsWith('/') ? trimUrl : `/${trimUrl}`
}

function isTabPage(url) {
  const basePath = getPathBase(url)
  return [
    '/pages/index/index',
    '/pages/tongue/tongue',
    '/pages/mall/mall',
    '/pages/profile/profile'
  ].indexOf(basePath) !== -1
}

App({
  _buildDefaultReviewConfig() {
    return {
      ...(config.reviewModeFallback || {}),
      enabled: true,
      hideHistoryAiRecords: true,
      allowReanalyzeAfterReview: true
    }
  },

  _normalizeReviewConfig(payload) {
    const fallback = this._buildDefaultReviewConfig()
    const reviewConfig = payload && typeof payload === 'object'
      ? (payload.reviewConfig && typeof payload.reviewConfig === 'object' ? payload.reviewConfig : payload)
      : {}

    const enabled = reviewConfig.enabled !== undefined ? reviewConfig.enabled !== false : fallback.enabled !== false
    const merged = {
      ...fallback,
      ...reviewConfig,
      enabled,
      hideHistoryAiRecords: reviewConfig.hideHistoryAiRecords !== undefined
        ? reviewConfig.hideHistoryAiRecords !== false
        : fallback.hideHistoryAiRecords !== false,
      allowReanalyzeAfterReview: reviewConfig.allowReanalyzeAfterReview !== undefined
        ? reviewConfig.allowReanalyzeAfterReview !== false
        : fallback.allowReanalyzeAfterReview !== false
    }

    if (!merged.shareTitle) {
      merged.shareTitle = enabled
        ? (fallback.shareTitle || config.shareTitle)
        : (config.normalShareTitle || config.shareTitle)
    }
    if (!merged.entryTitle) {
      merged.entryTitle = enabled ? fallback.entryTitle : 'AI看舌象'
    }
    if (!merged.pageTitle) {
      merged.pageTitle = enabled ? fallback.pageTitle : 'AI看舌象'
    }
    if (!merged.historyTitle) {
      merged.historyTitle = enabled ? fallback.historyTitle : '分析记录'
    }
    if (!merged.reportTitle) {
      merged.reportTitle = enabled ? fallback.reportTitle : '舌象分析报告'
    }
    if (!merged.submitText) {
      merged.submitText = enabled ? fallback.submitText : '开始 AI 分析'
    }
    if (!merged.historyLinkText) {
      merged.historyLinkText = enabled ? fallback.historyLinkText : '查看历史报告'
    }
    if (!merged.historyEmptyText) {
      merged.historyEmptyText = enabled ? fallback.historyEmptyText : '暂无分析记录'
    }
    if (!merged.listTagText) {
      merged.listTagText = fallback.listTagText || '待AI分析'
    }
    if (!merged.detailCtaText) {
      merged.detailCtaText = fallback.detailCtaText || '消耗 1 积分，立即生成 AI 体质报告'
    }
    if (!merged.previewPrimaryText) {
      merged.previewPrimaryText = enabled ? fallback.previewPrimaryText : '开始 AI 分析'
    }
    if (!merged.analyzingTitle) {
      merged.analyzingTitle = enabled ? fallback.analyzingTitle : '正在深度解析舌象特征'
    }
    if (!merged.analyzingSubtitle) {
      merged.analyzingSubtitle = enabled ? fallback.analyzingSubtitle : '结合中医体质理论进行推演…'
    }
    if (!Array.isArray(merged.guideTips) || merged.guideTips.length === 0) {
      merged.guideTips = Array.isArray(fallback.guideTips) ? fallback.guideTips : []
    }

    return merged
  },

  _applyRuntimeReviewConfig(nextConfig) {
    const reviewConfig = this._normalizeReviewConfig(nextConfig)
    this.globalData.reviewConfig = reviewConfig
    this.globalData.config = {
      ...config,
      shareTitle: reviewConfig.shareTitle || config.shareTitle,
      shareImageUrl: reviewConfig.enabled
        ? (reviewConfig.safeShareImageUrl || config.shareImageUrl || '')
        : (config.shareImageUrl || '')
    }
    this._updateReviewTabBar(reviewConfig.entryTitle)
    return reviewConfig
  },

  _updateReviewTabBar(entryTitle) {
    if (!entryTitle) return
    try {
      wx.setTabBarItem({
        index: 1,
        text: entryTitle
      })
    } catch (error) {
      console.warn('更新舌象 TabBar 文案失败:', error)
    }
  },

  _buildCustomerAccess() {
    return {
      role: 'customer',
      permissions: [],
      storeId: '',
      storeName: '',
      staffName: ''
    }
  },

  _snapshotSessionState() {
    return {
      openid: this.globalData.openid,
      userInfo: this.globalData.userInfo || {},
      workbenchAccess: this.globalData.workbenchAccess || this._buildCustomerAccess()
    }
  },

  _applyWorkbenchAccess(access) {
    const nextAccess = access || this._buildCustomerAccess()
    this.globalData.role = nextAccess.role || 'customer'
    this.globalData.permissions = Array.isArray(nextAccess.permissions) ? nextAccess.permissions : []
    this.globalData.workbenchAccess = {
      ...this._buildCustomerAccess(),
      ...nextAccess,
      permissions: Array.isArray(nextAccess.permissions) ? nextAccess.permissions : []
    }
    return this.globalData.workbenchAccess
  },

  _restoreSessionState(snapshot) {
    if (!snapshot) return
    this.globalData.openid = snapshot.openid || null
    this.globalData.userInfo = snapshot.userInfo || {}
    this._applyWorkbenchAccess(snapshot.workbenchAccess)
  },

  _readStoredUserInfo() {
    if (!wx || typeof wx.getStorageSync !== 'function') return {}
    try {
      const stored = wx.getStorageSync(USER_INFO_STORAGE_KEY)
      if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {}
      return stored
    } catch (error) {
      return {}
    }
  },

  _writeStoredUserInfo(userInfo) {
    if (!wx || typeof wx.setStorageSync !== 'function') return
    try {
      wx.setStorageSync(USER_INFO_STORAGE_KEY, userInfo || {})
    } catch (error) {
      console.warn('写入用户缓存失败:', error)
    }
  },

  _removeStoredUserInfo() {
    if (!wx || typeof wx.removeStorageSync !== 'function') return
    try {
      wx.removeStorageSync(USER_INFO_STORAGE_KEY)
    } catch (error) {
      console.warn('清理用户缓存失败:', error)
    }
  },

  _readMemberSession() {
    this._clearMemberSessionCache()
    return { ...MEMBER_SESSION_DEFAULT }
  },

  _writeMemberSession(session) {
    this._clearMemberSessionCache()
  },

  _clearMemberSessionCache() {
    if (!wx || typeof wx.removeStorageSync !== 'function') return
    try {
      wx.removeStorageSync(MEMBER_SESSION_KEY)
    } catch (error) {
      console.warn('清理会员会话失败:', error)
    }
  },

  _resetMemberSession() {
    this.globalData.memberSession = { ...MEMBER_SESSION_DEFAULT }
    this._clearMemberSessionCache()
    this.globalData.isLoggedIn = false
  },

  _reconcileMemberSessionOpenid(openid) {
    const activeSession = this.globalData.memberSession || MEMBER_SESSION_DEFAULT
    if (!activeSession.sessionToken || !activeSession.openid || !openid) return
    if (activeSession.openid === openid) return
    this._resetMemberSession()
  },

  _isSessionExpired(expiresAt) {
    if (!expiresAt) return true
    const time = new Date(expiresAt).getTime()
    if (!Number.isFinite(time)) return true
    return time <= Date.now()
  },

  _setRoleReady(ready) {
    this.globalData._roleReady = ready !== false
  },

  _getCloudActionFallbacks() {
    return [
      { name: 'opsApi', action: 'ensureUser' },
      { name: 'payApi', action: 'ensureUser' },
      { name: 'growthApi', action: 'ensureUser' },
      { name: 'commerceApi', action: 'ensureUser' }
    ]
  },

  _getWorkbenchRoleFallbacks() {
    return [
      { name: 'opsApi', action: 'getWorkbenchAccess' }
    ]
  },

  _isUnknownActionError(error) {
    if (!error) return false
    const rawCode = error.code
    const code = typeof rawCode === 'number' ? rawCode : Number(rawCode)
    const msg = String(error.message || error.errMsg || error.result?.msg || '')
    const hasUnknownMsg = /未知操作|No such action|not found|不存在|not exist|no such cloud function|Unknown operation|No such function/i.test(msg)
    if (!Number.isFinite(code)) {
      return hasUnknownMsg
    }
    return code === -1 && hasUnknownMsg
  },

  _isAuthRequiredError(error) {
    if (!error) return false
    const rawCode = error.code
    const code = typeof rawCode === 'number' ? rawCode : Number(rawCode)
    const msg = String(error.message || error.errMsg || error.result?.msg || '')
    return code === 401 || /未登录|请先完成手机号登录|请先绑定手机号|登录已过期/i.test(msg)
  },

  async _callCloudWithFallback(candidates, payload) {
    const requestPayload = { ...payload }
    let lastError
    for (const item of candidates) {
      try {
        const result = await callCloud(item.name, { ...requestPayload, action: item.action })
        return {
          ...result,
          _sourceFunction: item.name,
          _sourceAction: item.action
        }
      } catch (error) {
        lastError = error
        if (!this._isUnknownActionError(error)) break
      }
    }

    throw lastError || new Error('云端接口不可用')
  },

  _normalizeLoginResult(res) {
    if (!res) return null
    return {
      openid: res.openid || res._openid || res.data?.openid || res.data?._openid,
      userInfo: res.userInfo || res.data || res || null
    }
  },

  _hasBoundPhone(userInfo) {
    const phone = userInfo && typeof userInfo.phone === 'string'
      ? userInfo.phone.trim()
      : ''
    return !!phone
  },

  checkLogin() {
    const userInfo = this._readStoredUserInfo()
    const session = this._readMemberSession()
    const hasPhone = this._hasBoundPhone(userInfo)
    const hasValidSession = !!session.sessionToken && !this._isSessionExpired(session.expiresAt)

    this.globalData.userInfo = hasPhone ? userInfo : {}
    this.globalData.memberSession = hasValidSession
      ? { ...MEMBER_SESSION_DEFAULT, ...session, isLoggedIn: true }
      : { ...MEMBER_SESSION_DEFAULT }
    this.globalData.isLoggedIn = hasPhone && hasValidSession
    return this.globalData.isLoggedIn
  },

  setUserInfo(userInfo) {
    const nextUserInfo = userInfo && typeof userInfo === 'object' ? { ...userInfo } : {}
    this.globalData.userInfo = nextUserInfo
    if (this._hasBoundPhone(nextUserInfo)) {
      this._writeStoredUserInfo(nextUserInfo)
    } else {
      this._removeStoredUserInfo()
    }
    this.globalData.isLoggedIn = this._hasBoundPhone(nextUserInfo) && !!this.globalData.memberSession.sessionToken && !this._isSessionExpired(this.globalData.memberSession.expiresAt)
    return this.globalData.userInfo
  },

  setMemberSession(session) {
    const nextSession = {
      ...MEMBER_SESSION_DEFAULT,
      ...(session || {}),
      openid: (session && session.openid) || this.globalData.openid || '',
      sessionToken: (session && session.sessionToken) || '',
      expiresAt: (session && session.expiresAt) || '',
      isLoggedIn: !!(session && session.sessionToken) && !this._isSessionExpired(session.expiresAt)
    }
    this.globalData.memberSession = nextSession
    if (nextSession.isLoggedIn) {
      this._writeMemberSession(nextSession)
    } else {
      this._clearMemberSessionCache()
    }
    this.globalData.isLoggedIn = this._hasBoundPhone(this.globalData.userInfo) && nextSession.isLoggedIn
    return nextSession
  },

  getCustomerSessionToken() {
    const session = this.globalData.memberSession || MEMBER_SESSION_DEFAULT
    if (!session.sessionToken || this._isSessionExpired(session.expiresAt)) return ''
    return session.sessionToken
  },

  clearUserInfo() {
    this.globalData.userInfo = {}
    this.globalData.isLoggedIn = false
    this._removeStoredUserInfo()
  },

  clearCustomerAuth() {
    this.clearUserInfo()
    this._resetMemberSession()
  },

  isCustomerLoggedIn() {
    const hasPhone = this._hasBoundPhone(this.globalData.userInfo)
    const sessionToken = this.getCustomerSessionToken()
    this.globalData.isLoggedIn = hasPhone && !!sessionToken
    return this.globalData.isLoggedIn
  },

  setCustomerLoginSuccess(payload = {}) {
    const currentUserInfo = this.globalData.userInfo || {}
    const nextUserInfo = {
      ...currentUserInfo,
      ...(payload.user || {})
    }
    const safePhone = String(payload.phone || nextUserInfo.phone || '').trim()
    if (safePhone) {
      nextUserInfo.phone = safePhone
    }
    this.setUserInfo(nextUserInfo)
    this.setMemberSession({
      openid: this.globalData.openid || payload.openid || '',
      sessionToken: payload.sessionToken || '',
      expiresAt: payload.expiresAt || ''
    })
  },

  logoutCustomer() {
    this.clearCustomerAuth()
  },

  setPendingProtectedTarget(target) {
    this.globalData.pendingProtectedTarget = buildRedirectTarget(target)
  },

  consumePendingProtectedTarget() {
    const target = this.globalData.pendingProtectedTarget || ''
    this.globalData.pendingProtectedTarget = ''
    return target
  },

  getPrivacyAuthorizationState() {
    return new Promise(resolve => {
      if (!wx || typeof wx.getPrivacySetting !== 'function') {
        resolve({
          supported: false,
          needAuthorization: false,
          privacyContractName: DEFAULT_PRIVACY_CONTRACT_NAME
        })
        return
      }

      wx.getPrivacySetting({
        success: res => {
          resolve({
            supported: true,
            needAuthorization: !!res.needAuthorization,
            privacyContractName: res.privacyContractName || DEFAULT_PRIVACY_CONTRACT_NAME
          })
        },
        fail: error => {
          console.warn('获取隐私授权状态失败:', error)
          resolve({
            supported: true,
            needAuthorization: false,
            privacyContractName: DEFAULT_PRIVACY_CONTRACT_NAME
          })
        }
      })
    })
  },

  openPrivacyContract() {
    return new Promise((resolve, reject) => {
      if (!wx || typeof wx.openPrivacyContract !== 'function') {
        const error = new Error('当前微信版本不支持打开隐私保护指引')
        error.code = -1
        reject(error)
        return
      }

      wx.openPrivacyContract({
        success: resolve,
        fail: reject
      })
    })
  },

  _navigateToPageOrTab(url) {
    const target = buildRedirectTarget(url)
    if (!target) return
    try {
      if (isTabPage(target)) {
        wx.switchTab({ url: target })
      } else {
        wx.navigateTo({ url: target })
      }
    } catch (error) {
      wx.switchTab({ url: '/pages/profile/profile' })
    }
  },

  requireCustomerLogin(redirectTo, options = {}) {
    if (this.isCustomerLoggedIn()) return true
    const target = buildRedirectTarget(redirectTo)
    if (target) this.setPendingProtectedTarget(target)
    const modal = options.silent
      ? null
      : () => wx.showModal({
          title: options.title || '请先登录',
          content: options.content || '请先完成手机号绑定后再使用该功能',
          confirmText: options.confirmText || '去绑定手机号',
          cancelText: options.cancelText || '取消',
          success: res => {
            if (!res.confirm) return
            this._navigateToPageOrTab('/pages/profile/profile')
          }
        })

    if (modal) {
      modal()
    }
    return false
  },

  _normalizeRoleResult(res) {
    const access = res?.data?.role ? res.data : res
    if (!access) return null
    return {
      role: access.role === 'user' ? 'customer' : (access.role || 'customer'),
      permissions: Array.isArray(access.permissions) ? access.permissions : [],
      storeId: access.storeId || '',
      storeName: access.storeName || '',
      staffName: access.staffName || ''
    }
  },

  onLaunch: function () {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
      return
    }

    wx.cloud.init({
      env: config.cloudEnv || undefined,
      traceUser: true
    })

    this.globalData.config = {
      ...config,
      shareTitle: (config.reviewModeFallback && config.reviewModeFallback.shareTitle) || config.shareTitle
    }
    this._applyRuntimeReviewConfig(this._buildDefaultReviewConfig())
    this.loadReviewConfig().catch(() => {})
    this.checkLogin()

    // 登录
    this._login()
  },

  globalData: {
    config: null,
    userInfo: null,
    openid: null,
    storeInfo: null,
    role: 'customer',      // customer / staff / admin
    permissions: [],       // ['verify', 'viewOrders', ...]
    workbenchAccess: null,
    memberSession: { ...MEMBER_SESSION_DEFAULT },
    isLoggedIn: false,
    pendingProtectedTarget: '',
    reviewConfig: null,
    _reviewConfigPromise: null,
    _roleReady: false,
    _rolePromise: null,
    _pendingInviter: '',
    _loginPromise: null
  },

  loadReviewConfig: function ({ force = false } = {}) {
    if (!force && this.globalData.reviewConfig && this.globalData.reviewConfig._isRemoteConfig) {
      return Promise.resolve(this.globalData.reviewConfig)
    }
    if (!force && this.globalData._reviewConfigPromise) {
      return this.globalData._reviewConfigPromise
    }

    const promise = callCloud('growthApi', { action: 'getTongueRuntimeConfig' })
      .then(res => {
        const reviewConfig = this._applyRuntimeReviewConfig(res)
        this.globalData.reviewConfig = {
          ...reviewConfig,
          _isRemoteConfig: true
        }
        return this.globalData.reviewConfig
      })
      .catch(error => {
        if (!this._isAuthRequiredError(error)) {
          console.warn('加载审核配置失败，使用本地安全兜底:', error && error.message ? error.message : error)
        }
        return this._applyRuntimeReviewConfig(this._buildDefaultReviewConfig())
      })
      .finally(() => {
        this.globalData._reviewConfigPromise = null
      })

    this.globalData._reviewConfigPromise = promise
    return promise
  },

  getReviewConfig: function () {
    if (this.globalData.reviewConfig) return this.globalData.reviewConfig
    return this._applyRuntimeReviewConfig(this._buildDefaultReviewConfig())
  },

  getShareConfig: function () {
    const reviewConfig = this.getReviewConfig()
    return {
      title: reviewConfig.shareTitle || this.globalData.config.shareTitle || config.shareTitle,
      imageUrl: reviewConfig.enabled
        ? (reviewConfig.safeShareImageUrl || this.globalData.config.shareImageUrl || '')
        : (this.globalData.config.shareImageUrl || config.shareImageUrl || '')
    }
  },

  _login: function () {
    const payload = { invitedBy: this.globalData._pendingInviter || '' }
    const previousState = this._snapshotSessionState()
    const hadSession = Boolean(previousState.openid)
    if (!hadSession) {
      this._setRoleReady(false)
    }

    const promise = this._callCloudWithFallback(this._getCloudActionFallbacks(), payload)
      .then(res => {
        const normalized = this._normalizeLoginResult(res)
        if (!normalized || !normalized.openid) {
          const err = new Error(`登录返回缺失 openid: ${JSON.stringify(res)}`)
          err.code = -1
          throw err
        }
        this.globalData.openid = normalized.openid
        this._reconcileMemberSessionOpenid(normalized.openid)
        const nextUserInfo = {
          ...(this.globalData.userInfo || {}),
          ...(normalized.userInfo || {})
        }
        this.setUserInfo(nextUserInfo)
        // 登录成功后获取角色和权限
        return this._loadRole({ preserveExistingOnError: hadSession, fallbackState: previousState })
      })
      .catch(err => {
        console.error('登录失败:', {
          errCode: err?.code,
          msg: err?.message,
          actionPayload: payload,
          stack: err?.stack
        })
        // 补绑邀请关系等瞬时失败不应降级已登录会话；仅冷启动失败时回退为 customer。
        if (hadSession) {
          this._restoreSessionState(previousState)
        } else {
          this.globalData.openid = null
          this.clearUserInfo()
          this._applyWorkbenchAccess(this._buildCustomerAccess())
        }
        this._setRoleReady(true)
      })
    this.globalData._loginPromise = promise
    return promise
  },

  _loadRole: function ({ preserveExistingOnError = false, fallbackState = null } = {}) {
    this._setRoleReady(false)
    const promise = this._callCloudWithFallback(this._getWorkbenchRoleFallbacks(), {})
      .then(access => {
        const normalized = this._normalizeRoleResult(access)
        this._applyWorkbenchAccess(normalized || this._buildCustomerAccess())
        return this.globalData.workbenchAccess
      })
      .catch((err) => {
        console.error('角色加载失败:', {
          errCode: err?.code,
          msg: err?.message,
          stack: err?.stack
        })
        if (preserveExistingOnError && fallbackState) {
          this._restoreSessionState(fallbackState)
        } else {
          this._applyWorkbenchAccess(this._buildCustomerAccess())
        }
        return this.globalData.workbenchAccess
      })
      .finally(() => {
        this.globalData._rolePromise = null
        this._setRoleReady(true)
      })
    this.globalData._rolePromise = promise
    return promise
  },

  _syncInviterBinding(inviterOpenid) {
    const payload = { invitedBy: inviterOpenid || '' }
    return this._callCloudWithFallback(this._getCloudActionFallbacks(), payload)
      .then(res => {
        const normalized = this._normalizeLoginResult(res)
        if (normalized?.openid) {
          this.globalData.openid = this.globalData.openid || normalized.openid
        }
        if (normalized?.userInfo) {
          this.setUserInfo({
            ...(this.globalData.userInfo || {}),
            ...normalized.userInfo
          })
        }
        return normalized
      })
      .catch(err => {
        console.error('补绑邀请关系失败:', {
          errCode: err?.code,
          msg: err?.message,
          actionPayload: payload,
          stack: err?.stack
        })
        return null
      })
  },

  setInviter: function (inviterOpenid) {
    if (this.globalData.config.inviteBindRule === 'first' && this.globalData._pendingInviter) return
    this.globalData._pendingInviter = inviterOpenid
    // 已登录后只补绑邀请关系，不重新触发登录/角色刷新，避免瞬时失败降级会话。
    if (this.globalData.openid) {
      this._syncInviterBinding(inviterOpenid)
    }
  },

  getStoreInfo: function () {
    return new Promise((resolve) => {
      if (this.globalData.storeInfo) {
        this._normalizeStoreCloudAssets(this.globalData.storeInfo).then(storeWithAssets => {
          this.globalData.storeInfo = storeWithAssets
          resolve(storeWithAssets)
        }).catch(() => resolve(this._stripUnresolvedStoreCloudAssets(this.globalData.storeInfo)))
        return
      }
      this._callCloudWithFallback([
        { name: 'opsApi', action: 'getStoreInfo' }
      ], {}).then(storeInfo => {
        const normalizedStore = storeInfo && storeInfo.data ? storeInfo.data : storeInfo
        return this._normalizeStoreCloudAssets(normalizedStore)
      }).then(storeWithAssets => {
        this.globalData.storeInfo = storeWithAssets
        resolve(storeWithAssets)
      }).catch(() => resolve(null))
    })
  },

  _normalizeStoreCloudAssets: function (storeInfo) {
    if (!storeInfo) return Promise.resolve(null)

    const fileList = []
    if (storeInfo.logo && String(storeInfo.logo).startsWith('cloud://')) {
      fileList.push(String(storeInfo.logo))
    }
    if (Array.isArray(storeInfo.banners)) {
      storeInfo.banners.forEach(item => {
        if (item && String(item).startsWith('cloud://')) {
          fileList.push(String(item))
        }
      })
    }

    if (!fileList.length) {
      return Promise.resolve(this._stripUnresolvedStoreCloudAssets(storeInfo))
    }

    return wx.cloud.getTempFileURL({
      fileList: [...new Set(fileList)]
    }).then(res => {
      const urlMap = {}
      ;(res.fileList || []).forEach(item => {
        if (item.fileID && item.tempFileURL) {
          urlMap[item.fileID] = item.tempFileURL
        }
      })
      return {
        ...this._stripUnresolvedStoreCloudAssets(storeInfo),
        logo: urlMap[storeInfo.logo] || storeInfo.logo || '',
        banners: Array.isArray(storeInfo.banners)
          ? storeInfo.banners.map(item => urlMap[item] || item)
          : []
      }
    }).catch(error => {
      console.warn('转换门店资源地址失败，回退原始数据:', error)
      return this._stripUnresolvedStoreCloudAssets(storeInfo)
    })
  },

  _stripUnresolvedStoreCloudAssets: function (storeInfo) {
    if (!storeInfo) return null
    const next = { ...storeInfo }
    if (next.logo && String(next.logo).startsWith('cloud://')) {
      next.logo = ''
    }
    if (Array.isArray(next.banners)) {
      next.banners = next.banners.filter(item => item && !String(item).startsWith('cloud://'))
    }
    return next
  },

  onShareAppMessage: function () {
    const shareConfig = this.getShareConfig()
    return {
      title: shareConfig.title,
      imageUrl: shareConfig.imageUrl || '',
      path: '/pages/index/index'
    }
  }
})
