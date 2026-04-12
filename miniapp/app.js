// app.js - 小儿推拿门店拓客小程序
const config = require('./config')
const { callCloud } = require('./utils/cloud-api')

App({
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
      permissions: access.permissions || []
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
    workbenchAccess: null
  },

  _login: function () {
    const payload = { invitedBy: this.globalData._pendingInviter || '' }
    this._callCloudWithFallback(this._getCloudActionFallbacks(), payload)
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
        this._loadRole()
      })
      .catch(err => {
        console.error('登录失败:', {
          errCode: err?.code,
          msg: err?.message,
          actionPayload: payload,
          stack: err?.stack
        })
        // 兼容环境仍无效时，不阻塞首页渲染；默认当做普通用户继续运行
        this.globalData.openid = null
        this.globalData.userInfo = {}
        this.globalData.role = 'customer'
        this.globalData.permissions = []
        this.globalData.workbenchAccess = { role: 'customer', permissions: [] }
      })
  },

  _loadRole: function () {
    this._callCloudWithFallback(this._getWorkbenchRoleFallbacks(), {})
      .then(access => {
        const normalized = this._normalizeRoleResult(access)
        this.globalData.role = normalized?.role || 'customer'
        this.globalData.permissions = normalized?.permissions || []
        this.globalData.workbenchAccess = access
        console.log('角色:', this.globalData.role, '权限:', this.globalData.permissions)
      })
      .catch(() => {
        this.globalData.role = 'customer'
        this.globalData.permissions = []
        this.globalData.workbenchAccess = { role: 'customer', permissions: [] }
      })
  },

  setInviter: function (inviterOpenid) {
    if (this.globalData.config.inviteBindRule === 'first' && this.globalData._pendingInviter) return
    this.globalData._pendingInviter = inviterOpenid
    // 修复时序竞争：如果已登录，重新调用 ensureUser 补绑邀请关系
    if (this.globalData.openid) {
      this._login()
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
