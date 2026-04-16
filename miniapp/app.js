// app.js - 小儿推拿门店拓客小程序
const config = require('./config')
const { callCloud } = require('./utils/cloud-api')

App({
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

    this.globalData.config = config

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
    _roleReady: false,
    _rolePromise: null,
    _pendingInviter: '',
    _loginPromise: null
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
        this.globalData.userInfo = normalized.userInfo || {}
        console.log('登录成功，openid:', normalized.openid, '来源:', res._sourceFunction)
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
          this.globalData.userInfo = {}
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
        console.log('角色:', this.globalData.role, '权限:', this.globalData.permissions)
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
          this.globalData.userInfo = normalized.userInfo
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
      if (this.globalData.storeInfo) { resolve(this.globalData.storeInfo); return }
      this._callCloudWithFallback([
        { name: 'opsApi', action: 'getStoreInfo' }
      ], {}).then(storeInfo => {
        const normalizedStore = storeInfo && storeInfo.data ? storeInfo.data : storeInfo
        this.globalData.storeInfo = normalizedStore
        resolve(normalizedStore)
      }).catch(() => resolve(null))
    })
  },

  onShareAppMessage: function () {
    return {
      title: this.globalData.config.shareTitle,
      imageUrl: this.globalData.config.shareImageUrl || '',
      path: '/pages/index/index'
    }
  }
})
