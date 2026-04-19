const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('module')

const repoRoot = path.resolve(__dirname, '..')
const appPath = path.join(repoRoot, 'miniapp', 'app.js')
const USER_INFO_STORAGE_KEY = 'userInfo'
const MEMBER_SESSION_KEY = 'miniapp_member_session'

const dbCommand = {
  gte: (value) => ({ _op: 'gte', value }),
  gt: (value) => ({ _op: 'gt', value }),
  in: (value) => ({ _op: 'in', value }),
  inc: (value) => ({ _op: 'inc', value })
}

function loadFreshModule(modulePath, mocks = {}) {
  const resolvedPath = require.resolve(modulePath)
  const originalRequire = Module.prototype.require

  Module.prototype.require = function patchedRequire(id) {
    if (Object.prototype.hasOwnProperty.call(mocks, id)) {
      return mocks[id]
    }
    return originalRequire.apply(this, arguments)
  }

  delete require.cache[resolvedPath]

  try {
    return require(modulePath)
  } finally {
    Module.prototype.require = originalRequire
  }
}

function mockModule(modulePath, exports) {
  const original = require.cache[modulePath]
  const mock = new Module(modulePath, module)
  mock.filename = modulePath
  mock.loaded = true
  mock.exports = exports
  require.cache[modulePath] = mock
  return () => {
    delete require.cache[modulePath]
    if (original) {
      require.cache[modulePath] = original
    }
  }
}

function unloadModule(modulePath) {
  delete require.cache[modulePath]
}

function createOpsApiWxSdk({ user = null, phoneNumber = '13800138000', phoneError = null, phoneResponse = null } = {}) {
  const users = user ? [{ ...user }] : []
  const authSessions = []
  return {
    init: () => {},
    database: () => ({
      command: dbCommand,
      serverDate: () => new Date('2026-04-15T00:00:00Z'),
      collection(name) {
        if (name === 'users') return createUserCollection(users)
        if (name === 'auth_sessions') return createSessionCollection(authSessions)
        return createSessionCollection([])
      }
    }),
    getWXContext: () => ({ OPENID: 'test-openid' }),
    DYNAMIC_CURRENT_ENV: 'test-env',
    openapi: {
      phonenumber: {
        getPhoneNumber: async ({ code }) => {
          if (phoneError) {
            throw phoneError
          }
          if (code === 'valid-code') {
            if (phoneResponse) {
              return phoneResponse
            }
            return { phone_info: { phoneNumber } }
          }
          throw new Error('invalid code')
        }
      }
    }
  }
}

function matchesQuery(doc = {}, query = {}) {
  return Object.entries(query || {}).every(([key, expected]) => {
    if (expected && typeof expected === 'object' && expected._op === 'in') {
      return Array.isArray(expected.value) && expected.value.includes(doc[key])
    }
    return doc[key] === expected
  })
}

function applyUpdate(target, data = {}) {
  Object.entries(data || {}).forEach(([key, value]) => {
    target[key] = value
  })
}

function createSessionCollection(store) {
  return {
    where(query = {}) {
      return {
        limit(limitValue = store.length) {
          return {
            async get() {
              return {
                data: store.filter(doc => matchesQuery(doc, query)).slice(0, limitValue)
              }
            }
          }
        },
        async update({ data }) {
          let updated = 0
          store.forEach(doc => {
            if (matchesQuery(doc, query)) {
              applyUpdate(doc, data)
              updated += 1
            }
          })
          return { stats: { updated } }
        },
        async get() {
          return {
            data: store.filter(doc => matchesQuery(doc, query))
          }
        }
      }
    },
    doc(id) {
      return {
        async update({ data }) {
          const target = store.find(item => item._id === id)
          if (!target) return { stats: { updated: 0 } }
          applyUpdate(target, data)
          return { stats: { updated: 1 } }
        },
        async get() {
          return {
            data: store.find(item => item._id === id) || null
          }
        }
      }
    },
    async add({ data }) {
      const next = { _id: `sess-${store.length + 1}`, ...data }
      store.push(next)
      return { _id: next._id }
    }
  }
}

function createUserCollection(store) {
  return {
    where(query = {}) {
      return {
        limit(limitValue = store.length) {
          return {
            async get() {
              return {
                data: store.filter(doc => matchesQuery(doc, query)).slice(0, limitValue)
              }
            }
          }
        },
        async update({ data }) {
          let updated = 0
          store.forEach(doc => {
            if (matchesQuery(doc, query)) {
              applyUpdate(doc, data)
              updated += 1
            }
          })
          return { stats: { updated } }
        }
      }
    },
    doc(id) {
      return {
        async update({ data }) {
          const target = store.find(item => item._id === id)
          if (!target) return { stats: { updated: 0 } }
          applyUpdate(target, data)
          return { stats: { updated: 1 } }
        }
      }
    },
    async add({ data }) {
      const next = { _id: `user-${store.length + 1}`, ...data }
      store.push(next)
      return { _id: next._id }
    }
  }
}

function createOpsAuthWxSdk({ user, sessions = [] }) {
  const users = user ? [{ ...user }] : []
  const authSessions = sessions.map(item => ({ ...item }))

  return {
    init: () => {},
    DYNAMIC_CURRENT_ENV: 'test-env',
    database: () => ({
      command: dbCommand,
      serverDate: () => new Date('2026-04-15T00:00:00Z'),
      collection(name) {
        if (name === 'users') return createUserCollection(users)
        if (name === 'auth_sessions') return createSessionCollection(authSessions)
        return createSessionCollection([])
      }
    }),
    getWXContext: () => ({ OPENID: 'test-openid' }),
    openapi: {
      phonenumber: {
        getPhoneNumber: async () => ({ phone_info: { phoneNumber: '13800138000' } })
      }
    }
  }
}

function createGrowthAuthWxSdk({ user, sessions = [] }) {
  const users = user ? [{ ...user }] : []
  const authSessions = sessions.map(item => ({ ...item }))

  return {
    init: () => {},
    DYNAMIC_CURRENT_ENV: 'test-env',
    database: () => ({
      command: {
        ...dbCommand,
        neq: (value) => ({ _op: 'neq', value }),
        lte: (value) => ({ _op: 'lte', value })
      },
      serverDate: () => new Date('2026-04-15T00:00:00Z'),
      collection(name) {
        if (name === 'users') return createUserCollection(users)
        if (name === 'auth_sessions') return createSessionCollection(authSessions)
        return createSessionCollection([])
      }
    }),
    getWXContext: () => ({ OPENID: 'test-openid' })
  }
}

test('opsApi bindPhoneNumber rejects missing code and initializes missing user before returning session', async () => {
  const opsModule = loadFreshModule('../miniapp/cloudfunctions/opsApi/index.js', {
    'wx-server-sdk': createOpsApiWxSdk({ user: null })
  })

  const missingCode = await opsModule.main({ action: 'bindPhoneNumber', code: '' })
  assert.equal(missingCode.code, -1)
  assert.match(missingCode.msg, /缺少手机号授权码/)

  const missingUser = await opsModule.main({ action: 'bindPhoneNumber', code: 'valid-code' })
  assert.equal(missingUser.code, 0)
  assert.equal(missingUser.data.phone, '13800138000')
  assert.ok(missingUser.data.sessionToken)
})

test('opsApi bindPhoneNumber binds phone and handles rebind', async () => {
  const opsModule = loadFreshModule('../miniapp/cloudfunctions/opsApi/index.js', {
    'wx-server-sdk': createOpsApiWxSdk({
      user: { _id: 'user-1', _openid: 'test-openid', phone: '', storeId: 'store-a' }
    })
  })

  const res = await opsModule.main({ action: 'bindPhoneNumber', code: 'valid-code' })
  assert.equal(res.code, 0)
  assert.equal(res.data.phone, '13800138000')
  assert.ok(res.data.sessionToken)
  assert.ok(res.data.user)
  assert.equal(res.data.user.phone, '13800138000')
})

test('opsApi bindPhoneNumber accepts alternate phone response shapes from openapi', async () => {
  const opsModule = loadFreshModule('../miniapp/cloudfunctions/opsApi/index.js', {
    'wx-server-sdk': createOpsApiWxSdk({
      user: { _id: 'user-1', _openid: 'test-openid', phone: '', storeId: 'store-a' },
      phoneResponse: {
        data: {
          phoneInfo: {
            purePhoneNumber: '13800138001'
          }
        }
      }
    })
  })

  const res = await opsModule.main({ action: 'bindPhoneNumber', code: 'valid-code' })
  assert.equal(res.code, 0)
  assert.equal(res.data.phone, '13800138001')
  assert.equal(res.data.user.phone, '13800138001')
})

test('opsApi bindPhoneNumber exposes privacy declaration, permission, and invalid-code failures with specific messages', async () => {
  const privacyOpsModule = loadFreshModule('../miniapp/cloudfunctions/opsApi/index.js', {
    'wx-server-sdk': createOpsApiWxSdk({
      user: { _id: 'user-1', _openid: 'test-openid', phone: '', storeId: 'store-a' },
      phoneError: {
        errno: 112,
        message: 'getPhoneNumber:fail api scope is not declared in the privacy agreement'
      }
    })
  })

  const privacyRes = await privacyOpsModule.main({ action: 'bindPhoneNumber', code: 'valid-code' })
  assert.equal(privacyRes.code, 112)
  assert.match(privacyRes.msg, /隐私保护指引|隐私声明/)

  const permissionOpsModule = loadFreshModule('../miniapp/cloudfunctions/opsApi/index.js', {
    'wx-server-sdk': createOpsApiWxSdk({
      user: { _id: 'user-1', _openid: 'test-openid', phone: '', storeId: 'store-a' },
      phoneError: {
        errCode: -604101,
        errMsg: 'system error: error code: -604101 function has no permission to call this API'
      }
    })
  })

  const permissionRes = await permissionOpsModule.main({ action: 'bindPhoneNumber', code: 'valid-code' })
  assert.equal(permissionRes.code, -604101)
  assert.match(permissionRes.msg, /缺少手机号权限|联系管理员/)

  const invalidCodeOpsModule = loadFreshModule('../miniapp/cloudfunctions/opsApi/index.js', {
    'wx-server-sdk': createOpsApiWxSdk({
      user: { _id: 'user-1', _openid: 'test-openid', phone: '', storeId: 'store-a' },
      phoneError: {
        errCode: 40029,
        message: 'invalid code'
      }
    })
  })

  const invalidCodeRes = await invalidCodeOpsModule.main({ action: 'bindPhoneNumber', code: 'valid-code' })
  assert.equal(invalidCodeRes.code, -1)
  assert.match(invalidCodeRes.msg, /重新点击授权|授权已失效/)
})

test('opsApi declares phone number openapi permission in cloud function config', () => {
  const configPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'opsApi', 'config.json')
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))

  assert.ok(config.permissions)
  assert.ok(Array.isArray(config.permissions.openapi))
  assert.ok(config.permissions.openapi.includes('phonenumber.getPhoneNumber'))
})

test('opsApi ensureAuth, getSession and logout follow the persisted session lifecycle', async () => {
  const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const opsModule = loadFreshModule('../miniapp/cloudfunctions/opsApi/index.js', {
    'wx-server-sdk': createOpsAuthWxSdk({
      user: {
        _id: 'user-1',
        _openid: 'test-openid',
        phone: '13800138000',
        memberLevel: 'vip',
        loginStatus: 'logged_in'
      },
      sessions: [{
        _id: 'sess-1',
        token: 'sess-active',
        _openid: 'test-openid',
        status: 'active',
        expiresAt: futureDate
      }]
    })
  })

  const authRes = await opsModule.main({ action: 'ensureAuth', sessionToken: 'sess-active' })
  assert.equal(authRes.code, 0)
  assert.equal(authRes.data.user.phone, '13800138000')
  assert.equal(authRes.data.session.token, 'sess-active')

  const resumeRes = await opsModule.main({ action: 'getSession', sessionToken: 'sess-active' })
  assert.equal(resumeRes.code, 0)
  assert.equal(resumeRes.data.user._id, 'user-1')

  const logoutRes = await opsModule.main({ action: 'logout', sessionToken: 'sess-active' })
  assert.equal(logoutRes.code, 0)

  const afterLogoutRes = await opsModule.main({ action: 'ensureAuth', sessionToken: 'sess-active' })
  assert.equal(afterLogoutRes.code, 401)
  assert.match(afterLogoutRes.msg, /未登录|重新登录/)
})

test('growthApi analyzeTongue rejects missing and expired sessions before touching AI runtime', async () => {
  const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const growthModule = loadFreshModule('../miniapp/cloudfunctions/growthApi/index.js', {
    'wx-server-sdk': createGrowthAuthWxSdk({
      user: {
        _id: 'user-1',
        _openid: 'test-openid',
        phone: '13800138000',
        memberLevel: 'svip'
      },
      sessions: [{
        _id: 'sess-expired',
        token: 'sess-expired',
        _openid: 'test-openid',
        status: 'active',
        expiresAt: expiredDate
      }]
    })
  })

  const missingTokenRes = await growthModule.main({
    action: 'analyzeTongue',
    imageFileId: 'cloud://demo-file'
  })
  assert.equal(missingTokenRes.code, 401)
  assert.match(missingTokenRes.msg, /未登录/)

  const expiredTokenRes = await growthModule.main({
    action: 'analyzeTongue',
    imageFileId: 'cloud://demo-file',
    sessionToken: 'sess-expired'
  })
  assert.equal(expiredTokenRes.code, 401)
  assert.match(expiredTokenRes.msg, /过期|重新登录/)
})

test('growthApi getTongueRuntimeConfig is available before member login', async () => {
  const growthModule = loadFreshModule('../miniapp/cloudfunctions/growthApi/index.js', {
    'wx-server-sdk': createGrowthAuthWxSdk({ user: null, sessions: [] })
  })

  const res = await growthModule.main({ action: 'getTongueRuntimeConfig' })
  assert.equal(res.code, 0)
  assert.ok(res.data)
  assert.equal(typeof res.data.isInReview, 'boolean')
  assert.ok(res.data.reviewConfig)
})

test('leads.updateCustomer rejects cross-store updates and writes audit log', async () => {
  const leadsPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'modules-leads.js')
  const dataPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'data.js')
  const contextPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'context.js')

  unloadModule(leadsPath)

  let auditLog = null
  let updateDocId = null
  let updatePayload = null

  const restoreData = mockModule(dataPath, {
    getAccessStoreId: (access) => access.account.storeId,
    safeGetFirst: async (collection, condition) => {
      if (collection === 'users') {
        if (condition._openid === 'user-own' && condition.storeId === 'store-a') {
          return { _id: 'doc-own', _openid: 'user-own', storeId: 'store-a', memberLevel: 'normal', memberNote: '' }
        }
        if (condition._openid === 'user-cross' && condition.storeId === 'store-a') {
          return null
        }
      }
      return null
    },
    safeList: async () => [],
    writeAuditLog: async (access, payload) => {
      auditLog = payload
    },
    _cmd: dbCommand
  })

  const restoreContext = mockModule(contextPath, {
    db: {
      serverDate: () => new Date('2026-04-15T00:00:00Z'),
      collection: () => ({
        doc: (id) => ({
          update: async ({ data }) => {
            updateDocId = id
            updatePayload = data
            return { stats: { updated: 1 } }
          }
        })
      })
    },
    _cmd: dbCommand
  })

  try {
    const { updateCustomer } = require(leadsPath)
    const access = { uid: 'admin-1', account: { storeId: 'store-a', username: 'boss', displayName: '老板' } }

    const crossStoreRes = await updateCustomer(access, { openid: 'user-cross', memberLevel: 'vip', memberNote: 'test' })
    assert.equal(crossStoreRes.code, -1)
    assert.match(crossStoreRes.msg, /用户不存在|无权限/)

    const ownRes = await updateCustomer(access, { openid: 'user-own', memberLevel: 'vip', memberNote: '重要客户' })
    assert.equal(ownRes.code, 0)
    assert.equal(updateDocId, 'doc-own')
    assert.equal(updatePayload.memberLevel, 'vip')
    assert.equal(updatePayload.memberNote, '重要客户')
    assert.ok(auditLog)
    assert.equal(auditLog.action, 'leads.updateCustomer')
  } finally {
    restoreData()
    restoreContext()
    unloadModule(leadsPath)
  }
})

test('leads.updateCustomer ignores invalid memberLevel but allows note-only update', async () => {
  const leadsPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'modules-leads.js')
  const dataPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'data.js')
  const contextPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'context.js')

  unloadModule(leadsPath)

  let updatePayload = null

  const restoreData = mockModule(dataPath, {
    getAccessStoreId: (access) => access.account.storeId,
    safeGetFirst: async (collection, condition) => {
      if (collection === 'users' && condition._openid === 'user-own' && condition.storeId === 'store-a') {
        return { _id: 'doc-own', _openid: 'user-own', storeId: 'store-a', memberLevel: 'normal', memberNote: '' }
      }
      return null
    },
    safeList: async () => [],
    writeAuditLog: async () => null,
    _cmd: dbCommand
  })

  const restoreContext = mockModule(contextPath, {
    db: {
      serverDate: () => new Date('2026-04-15T00:00:00Z'),
      collection: () => ({
        doc: () => ({
          update: async ({ data }) => {
            updatePayload = data
            return { stats: { updated: 1 } }
          }
        })
      })
    },
    _cmd: dbCommand
  })

  try {
    const { updateCustomer } = require(leadsPath)
    const access = { uid: 'admin-1', account: { storeId: 'store-a', username: 'boss', displayName: '老板' } }

    const invalidLevelRes = await updateCustomer(access, { openid: 'user-own', memberLevel: 'super', memberNote: '仅备注' })
    assert.equal(invalidLevelRes.code, 0)
    assert.equal(updatePayload.memberLevel, undefined)
    assert.equal(updatePayload.memberNote, '仅备注')
  } finally {
    restoreData()
    restoreContext()
    unloadModule(leadsPath)
  }
})

function loadMiniappPage(relPath) {
  const pageModulePath = path.join(repoRoot, relPath)
  delete require.cache[require.resolve(pageModulePath)]
  // 清除 cloud-api 缓存，让它读取新的 global.wx
  const cloudApiPath = path.join(repoRoot, 'miniapp', 'utils', 'cloud-api.js')
  delete require.cache[require.resolve(cloudApiPath)]

  let pageDef = null
  global.Page = definition => {
    pageDef = definition
  }

  require(pageModulePath)
  assert.ok(pageDef, `expected Page() definition for ${relPath}`)

  return pageDef
}

function loadMiniappApp(storageInitial = {}) {
  const persistedStore = new Map()
  Object.entries(storageInitial).forEach(([key, value]) => {
    persistedStore.set(key, value)
  })

  let appInstance = null
  const wxCalls = {
    setStorage: [],
    removeStorage: []
  }

  global.App = config => {
    appInstance = config
  }
  global.wx = {
    cloud: {
      init: () => {}
    },
    getStorageSync(key) {
      return persistedStore.get(key) || {}
    },
    setStorageSync(key, value) {
      wxCalls.setStorage.push({ key, value })
      persistedStore.set(key, value)
    },
    removeStorageSync(key) {
      wxCalls.removeStorage.push(key)
      persistedStore.delete(key)
    }
  }

  delete require.cache[require.resolve(appPath)]
  require(appPath)

  return {
    app: appInstance,
    stored: persistedStore,
    getUserInfo: () => persistedStore.get(USER_INFO_STORAGE_KEY) || null,
    getSession: () => persistedStore.get(MEMBER_SESSION_KEY) || null,
    wxCalls,
    cleanup() {
      delete require.cache[require.resolve(appPath)]
      delete global.App
      delete global.wx
    }
  }
}

test('profile onGetPhoneNumber refreshes local state with full bind payload', async () => {
  const pageDef = loadMiniappPage('miniapp/pages/profile/profile.js')
  const wxCalls = { showToast: [] }

  try {
    global.wx = {
      cloud: {
        callFunction({ name, data }) {
          if (name === 'opsApi') {
            assert.equal(data.action, 'bindPhoneNumber')
            assert.equal(data.code, 'mock-phone-code')
            return Promise.resolve({
              result: {
                code: 0,
                data: {
                  phone: '13800138000',
                  sessionToken: 'sess-1',
                  expiresAt: '2099-01-01T00:00:00.000Z',
                  user: { nickName: 'TestUser', phone: '13800138000' }
                }
              }
            })
          }
          if (name === 'growthApi') {
            return Promise.resolve({ result: { code: 0, data: data.action === 'getMyEarnings' ? {} : [] } })
          }
          if (name === 'commerceApi') {
            return Promise.resolve({ result: { code: 0, data: { all: 0, pending: 0, refund: 0 } } })
          }
          throw new Error(`unexpected cloud function: ${name}`)
        }
      },
      showToast(payload) {
        wxCalls.showToast.push(payload)
      }
    }

    const appMock = {
      globalData: { userInfo: { nickName: 'TestUser', phone: '' } },
      setCustomerLoginSuccess(payload) {
        this.globalData.userInfo = { ...(payload.user || {}), phone: payload.phone }
        this.globalData.memberSession = {
          sessionToken: payload.sessionToken,
          expiresAt: payload.expiresAt
        }
      },
      isCustomerLoggedIn() {
        return true
      },
      getCustomerSessionToken() {
        return this.globalData.memberSession && this.globalData.memberSession.sessionToken
      },
      consumePendingProtectedTarget() {
        return ''
      }
    }
    global.getApp = () => appMock

    const setDataCalls = []
    const page = {
      ...pageDef,
      data: JSON.parse(JSON.stringify(pageDef.data)),
      setData(update) {
        setDataCalls.push(update)
        for (const [key, value] of Object.entries(update)) {
          const keys = key.split('.')
          let target = this.data
          for (let i = 0; i < keys.length - 1; i++) {
            if (!target[keys[i]]) target[keys[i]] = {}
            target = target[keys[i]]
          }
          target[keys[keys.length - 1]] = value
        }
      }
    }

    await page.onGetPhoneNumber({ detail: { code: 'mock-phone-code' } })

    assert.equal(wxCalls.showToast.length, 1)
    assert.equal(wxCalls.showToast[0].title, '绑定成功')
    assert.equal(wxCalls.showToast[0].icon, 'success')

    // 验证 page data 被刷新
    assert.equal(page.data.userInfo.phone, '13800138000')
    // 验证 app.globalData 被刷新
    assert.equal(appMock.globalData.userInfo.phone, '13800138000')
    assert.equal(appMock.globalData.memberSession.sessionToken, 'sess-1')
    const loginUpdate = setDataCalls.find(u => u && u.userInfo && u.userInfo.phone === '13800138000')
    assert.ok(loginUpdate, 'expected setData to include refreshed userInfo')
  } finally {
    delete global.Page
    delete global.wx
    delete global.getApp
  }
})

test('profile onGetPhoneNumber surfaces privacy declaration guidance when phone scope is undeclared', async () => {
  const pageDef = loadMiniappPage('miniapp/pages/profile/profile.js')
  const wxCalls = { showToast: [], showModal: [] }
  let cloudCalls = 0

  try {
    global.wx = {
      cloud: {
        callFunction() {
          cloudCalls += 1
          throw new Error('should not request bindPhoneNumber when privacy scope is undeclared')
        }
      },
      showToast(payload) {
        wxCalls.showToast.push(payload)
      },
      showModal(payload) {
        wxCalls.showModal.push(payload)
      }
    }

    const appMock = {
      isPrivacyScopeUndeclaredError(detail) {
        return detail && detail.errno === 112
      },
      showPrivacyDeclarationMissingModal(feature) {
        wx.showModal({
          title: '当前版本暂无法完成授权',
          content: `微信检测到当前版本未完成${feature}所需的隐私声明配置，请先完善《用户隐私保护指引》后再试。`,
          showCancel: false
        })
      }
    }
    global.getApp = () => appMock

    const page = {
      ...pageDef,
      data: { ...JSON.parse(JSON.stringify(pageDef.data)), privacyChecked: true },
      setData(update) {
        this.data = { ...this.data, ...update }
      }
    }

    await page.onGetPhoneNumber({
      detail: {
        errMsg: 'getPhoneNumber:fail api scope is not declared in the privacy agreement',
        errno: 112
      }
    })

    assert.equal(cloudCalls, 0)
    assert.equal(page.data.privacyDeclarationMissing, true)
    assert.equal(page.data.needPrivacyAuthorization, false)
    assert.equal(page.data.loggingIn, false)
    assert.equal(wxCalls.showToast.length, 0)
    assert.equal(wxCalls.showModal.length, 1)
    assert.match(wxCalls.showModal[0].content, /手机号登录/)
  } finally {
    delete global.Page
    delete global.wx
    delete global.getApp
  }
})

test('profile onGetPhoneNumber maps server-side privacy declaration errors into the privacy guidance state', async () => {
  const pageDef = loadMiniappPage('miniapp/pages/profile/profile.js')
  const wxCalls = { showToast: [], showModal: [] }

  try {
    global.wx = {
      cloud: {
        callFunction() {
          return Promise.resolve({
            result: {
              code: 112,
              msg: '当前版本未完成手机号相关隐私声明配置，请完善《用户隐私保护指引》后再试'
            }
          })
        }
      },
      showToast(payload) {
        wxCalls.showToast.push(payload)
      },
      showModal(payload) {
        wxCalls.showModal.push(payload)
      }
    }

    const appMock = {
      isPrivacyScopeUndeclaredError(detail) {
        return detail && (detail.code === 112 || detail.errno === 112)
      },
      showPrivacyDeclarationMissingModal(feature) {
        wx.showModal({
          title: '当前版本暂无法完成授权',
          content: `微信检测到当前版本未完成${feature}所需的隐私声明配置，请先完善《用户隐私保护指引》后再试。`,
          showCancel: false
        })
      }
    }
    global.getApp = () => appMock

    const page = {
      ...pageDef,
      data: { ...JSON.parse(JSON.stringify(pageDef.data)), privacyChecked: true },
      setData(update) {
        this.data = { ...this.data, ...update }
      }
    }

    await page.onGetPhoneNumber({ detail: { code: 'mock-phone-code', errMsg: 'getPhoneNumber:ok' } })

    assert.equal(page.data.privacyDeclarationMissing, true)
    assert.equal(page.data.loggingIn, false)
    assert.equal(wxCalls.showToast.length, 0)
    assert.equal(wxCalls.showModal.length, 1)
    assert.match(wxCalls.showModal[0].content, /手机号登录/)
  } finally {
    delete global.Page
    delete global.wx
    delete global.getApp
  }
})

test('profile page exposes guest login guidance while cart checkout and payment stay login-gated', () => {
  const profileJsSource = fs.readFileSync(path.join(repoRoot, 'miniapp', 'pages', 'profile', 'profile.js'), 'utf8')
  const profileWxmlSource = fs.readFileSync(path.join(repoRoot, 'miniapp', 'pages', 'profile', 'profile.wxml'), 'utf8')
  const cartSource = fs.readFileSync(path.join(repoRoot, 'miniapp', 'pages', 'cart', 'cart.js'), 'utf8')
  const appSource = fs.readFileSync(path.join(repoRoot, 'miniapp', 'app.js'), 'utf8')

  assert.match(profileJsSource, /_requireLogin/)
  assert.match(profileJsSource, /requireCustomerLogin/)
  assert.match(profileJsSource, /consumePendingProtectedTarget/)
  assert.match(profileJsSource, /openPrivacyContract/)
  assert.match(profileJsSource, /onAgreePrivacyAuthorization/)
  assert.match(profileJsSource, /privacyDeclarationMissing/)
  assert.match(profileWxmlSource, /guest-showcase-card/)
  assert.match(profileWxmlSource, /<text class="guest-showcase-title">未登录<\/text>/)
  assert.match(profileWxmlSource, /agreePrivacyAuthorization/)
  assert.match(profileWxmlSource, /同意隐私指引/)
  assert.match(profileWxmlSource, /当前版本暂无法使用手机号登录/)
  assert.match(profileWxmlSource, /重新检查/)
  assert.match(profileWxmlSource, /微信授权手机号登录/)
  assert.match(profileWxmlSource, /退出登录/)
  assert.match(appSource, /getPrivacySetting/)
  assert.match(appSource, /openPrivacyContract/)
  assert.match(appSource, /isPrivacyScopeUndeclaredError/)

  assert.match(cartSource, /requireCustomerLogin\('\/pages\/cart\/cart\?from=checkout'/)
  assert.match(cartSource, /callCloudWithLogin\('commerceApi',\s*\{\s*action:\s*'createCartOrder'/s)
  assert.match(cartSource, /callCloudWithLogin\('commerceApi',\s*\{\s*action:\s*'requestPay'/s)
})

test('callCloudWithLogin blocks API calls when customer is not bound and raises -401', () => {
  global.getApp = () => ({
    isCustomerLoggedIn() {
      return false
    }
  })
  global.wx = {
    cloud: {
      callFunction() {
        throw new Error('should not call cloud')
      }
    }
  }

  try {
    const { callCloudWithLogin } = require('../miniapp/utils/cloud-api')
    assert.throws(
      () => callCloudWithLogin('growthApi', { action: 'getTongueHistory' }),
      (error) => error && error.code === -401 && error.message === '请先绑定手机号后再访问'
    )
  } finally {
    delete global.getApp
    delete global.wx
  }
})

test('miniapp member session stays in memory only and hard logout clears both user and session', () => {
  const firstRun = loadMiniappApp()
  const firstApp = firstRun.app

  firstApp.globalData.openid = 'openid-1'
  firstApp.globalData.userInfo = { nickName: 'TestUser' }
  firstApp.setCustomerLoginSuccess({
    phone: '13800138000',
    sessionToken: 'sess-1',
    expiresAt: '2099-01-01T00:00:00.000Z',
    user: { nickName: 'TestUser' }
  })

  const sessionAfterBind = firstRun.getSession()
  const userAfterBind = firstRun.getUserInfo()
  assert.equal(sessionAfterBind, null)
  assert.equal(userAfterBind.phone, '13800138000')
  assert.equal(firstApp.globalData.userInfo.phone, '13800138000')
  assert.equal(firstApp.isCustomerLoggedIn(), true)
  firstRun.cleanup()

  const reopenRun = loadMiniappApp({
    [USER_INFO_STORAGE_KEY]: userAfterBind
  })
  const reopenApp = reopenRun.app
  reopenApp.checkLogin()
  assert.equal(reopenApp.globalData.memberSession.isLoggedIn, false)
  assert.equal(reopenApp.globalData.userInfo.phone, '13800138000')
  assert.equal(reopenApp.isCustomerLoggedIn(), false)

  reopenApp.logoutCustomer()
  assert.equal(reopenApp.globalData.memberSession.isLoggedIn, false)
  assert.equal(reopenRun.getSession(), null)
  assert.equal(reopenRun.getUserInfo(), null)
  assert.deepEqual(reopenApp.globalData.userInfo, {})

  reopenApp.checkLogin()
  assert.deepEqual(reopenApp.globalData.userInfo, {})
  assert.equal(reopenApp.isCustomerLoggedIn(), false)
  reopenRun.cleanup()
})

test('tongue page keeps interface visible and prompts login before protected actions when customer login is missing', async () => {
  const cloudCalls = []
  const wxCalls = { showToast: [] }
  const appMock = {
    isCustomerLoggedIn: () => false,
    setPendingProtectedTarget: () => {},
    loadReviewConfig: async () => {},
    getReviewConfig: () => ({ enabled: true, historyEmptyText: '暂无照片记录' }),
    getPrivacyAuthorizationState: async () => ({
      needAuthorization: true,
      privacyContractName: '《测试隐私保护指引》'
    })
  }

  global.wx = {
    cloud: {
      callFunction({ name, data }) {
        cloudCalls.push({ name, action: data.action })
        return Promise.resolve({ result: { code: 0, data: {} } })
      }
    },
    navigateTo: () => {},
    switchTab: () => {},
    setNavigationBarTitle: () => {},
    showToast: payload => {
      wxCalls.showToast.push(payload)
    },
    getStorageSync: () => '',
    setStorageSync: () => {}
  }

  const tonguePage = loadMiniappPage('miniapp/pages/tongue/tongue.js')
  const tongueInstance = {
    ...tonguePage,
    data: JSON.parse(JSON.stringify(tonguePage.data)),
    setData(update) {
      this.data = { ...this.data, ...update }
    }
  }

  try {
    global.getApp = () => appMock

    await tongueInstance.onLoad()
    await tongueInstance.onShow()
    assert.equal(tongueInstance.data.showLoginModal, true)
    assert.equal(tongueInstance.data.privacyChecked, true)
    assert.equal(tongueInstance.data.needPrivacyAuthorization, true)
    assert.equal(tongueInstance.data.privacyContractName, '《测试隐私保护指引》')
    tongueInstance.onAgreePrivacyAuthorization()
    assert.equal(tongueInstance.data.needPrivacyAuthorization, false)
    tongueInstance.closeLoginModal()
    assert.equal(tongueInstance.data.showLoginModal, false)
    tongueInstance.chooseImage()
    await tongueInstance.startAnalyze()
    tongueInstance.goToHistory()

    assert.equal(cloudCalls.length, 0)
    assert.equal(tongueInstance.data.isLoggedIn, false)
    assert.equal(tongueInstance.data.state, 'idle')
    assert.equal(tongueInstance.data.showLoginModal, true)
    assert.equal(wxCalls.showToast[0].title, '已同意隐私指引')
  } finally {
    delete global.Page
    delete global.getApp
    delete global.wx
  }
})

test('tongue onGetPhoneNumber surfaces privacy declaration guidance when phone scope is undeclared', async () => {
  const tonguePage = loadMiniappPage('miniapp/pages/tongue/tongue.js')
  const wxCalls = { showToast: [], showModal: [] }
  let cloudCalls = 0

  try {
    global.wx = {
      cloud: {
        callFunction() {
          cloudCalls += 1
          throw new Error('should not request bindPhoneNumber when privacy scope is undeclared')
        }
      },
      showToast(payload) {
        wxCalls.showToast.push(payload)
      },
      showModal(payload) {
        wxCalls.showModal.push(payload)
      },
      getStorageSync: () => '',
      setStorageSync: () => {}
    }

    const appMock = {
      isPrivacyScopeUndeclaredError(detail) {
        return detail && detail.errno === 112
      },
      showPrivacyDeclarationMissingModal(feature) {
        wx.showModal({
          title: '当前版本暂无法完成授权',
          content: `微信检测到当前版本未完成${feature}所需的隐私声明配置，请先完善《用户隐私保护指引》后再试。`,
          showCancel: false
        })
      }
    }
    global.getApp = () => appMock

    const tongueInstance = {
      ...tonguePage,
      data: { ...JSON.parse(JSON.stringify(tonguePage.data)), privacyChecked: true },
      setData(update) {
        this.data = { ...this.data, ...update }
      }
    }

    await tongueInstance.onGetPhoneNumber({
      detail: {
        errMsg: 'getPhoneNumber:fail api scope is not declared in the privacy agreement',
        errno: 112
      }
    })

    assert.equal(cloudCalls, 0)
    assert.equal(tongueInstance.data.privacyDeclarationMissing, true)
    assert.equal(tongueInstance.data.needPrivacyAuthorization, false)
    assert.equal(tongueInstance.data.showLoginModal, true)
    assert.equal(wxCalls.showToast.length, 0)
    assert.equal(wxCalls.showModal.length, 1)
    assert.match(wxCalls.showModal[0].content, /手机号登录/)
  } finally {
    delete global.Page
    delete global.getApp
    delete global.wx
  }
})

test('tongue onGetPhoneNumber maps server-side privacy declaration errors into the privacy guidance state', async () => {
  const tonguePage = loadMiniappPage('miniapp/pages/tongue/tongue.js')
  const wxCalls = { showToast: [], showModal: [] }

  try {
    global.wx = {
      cloud: {
        callFunction() {
          return Promise.resolve({
            result: {
              code: 112,
              msg: '当前版本未完成手机号相关隐私声明配置，请完善《用户隐私保护指引》后再试'
            }
          })
        }
      },
      showToast(payload) {
        wxCalls.showToast.push(payload)
      },
      showModal(payload) {
        wxCalls.showModal.push(payload)
      },
      getStorageSync: () => '',
      setStorageSync: () => {}
    }

    const appMock = {
      isPrivacyScopeUndeclaredError(detail) {
        return detail && (detail.code === 112 || detail.errno === 112)
      },
      showPrivacyDeclarationMissingModal(feature) {
        wx.showModal({
          title: '当前版本暂无法完成授权',
          content: `微信检测到当前版本未完成${feature}所需的隐私声明配置，请先完善《用户隐私保护指引》后再试。`,
          showCancel: false
        })
      }
    }
    global.getApp = () => appMock

    const tongueInstance = {
      ...tonguePage,
      data: { ...JSON.parse(JSON.stringify(tonguePage.data)), privacyChecked: true, showLoginModal: true },
      setData(update) {
        this.data = { ...this.data, ...update }
      }
    }

    await tongueInstance.onGetPhoneNumber({ detail: { code: 'mock-phone-code', errMsg: 'getPhoneNumber:ok' } })

    assert.equal(tongueInstance.data.privacyDeclarationMissing, true)
    assert.equal(tongueInstance.data.showLoginModal, true)
    assert.equal(tongueInstance.data.loggingIn, false)
    assert.equal(wxCalls.showToast.length, 0)
    assert.equal(wxCalls.showModal.length, 1)
    assert.match(wxCalls.showModal[0].content, /手机号登录/)
  } finally {
    delete global.Page
    delete global.getApp
    delete global.wx
  }
})

test('leads.listCustomers is store-scoped and reuses storeId in followup joins', async () => {
  const leadsPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'modules-leads.js')
  const dataPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'data.js')
  const contextPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'context.js')

  unloadModule(leadsPath)

  let usersQuery = null
  let followupQuery = null
  let detailStoreQuery = null

  const restoreData = mockModule(dataPath, {
    getAccessStoreId: (access) => access.account.storeId,
    safeList: async (collection, condition) => {
      if (collection === 'users') {
        usersQuery = condition
        return [
          {
            _openid: 'u1',
            nickName: 'A用户',
            avatarUrl: 'https://img/c1.png',
            phone: '13800138000',
            storeId: 'store-a',
            memberLevel: 'vip'
          }
        ]
      }
      if (collection === 'tongue_reports') {
        return []
      }
      if (collection === 'customer_followups') {
        followupQuery = condition
        return []
      }
      return []
    },
    safeGetFirst: async (collection, condition) => {
      if (collection === 'stores') {
        detailStoreQuery = condition
        return { _id: 'store-a', staff: [] }
      }
      return null
    },
    fetchUsersMap: async () => ({}),
    _cmd: dbCommand
  })

  const restoreContext = mockModule(contextPath, {
    _cmd: dbCommand
  })

  try {
    const { listCustomers } = require(leadsPath)
    const access = {
      uid: 'admin-1',
      account: { storeId: 'store-a', username: 'owner', displayName: '老板' }
    }
    const res = await listCustomers(access, { keyword: '13800138000' })

    assert.equal(res.code, 0)
    assert.equal(res.data.list.length, 1)
    assert.equal(usersQuery.storeId, 'store-a')
    assert.equal(followupQuery.storeId, 'store-a')
    assert.equal(detailStoreQuery._id, 'store-a')
  } finally {
    restoreData()
    restoreContext()
    unloadModule(leadsPath)
  }
})

test('leads.getCustomerDetail is store-scoped for order/followup/tongue joins', async () => {
  const leadsPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'modules-leads.js')
  const dataPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'data.js')
  const contextPath = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'context.js')

  unloadModule(leadsPath)

  let customerQuery = null
  let ordersQuery = null
  let followupQuery = null
  let tongueQuery = null

  const restoreData = mockModule(dataPath, {
    getAccessStoreId: (access) => access.account.storeId,
    safeGetFirst: async (collection, condition) => {
      if (collection === 'users' && condition._openid === 'u1' && condition.storeId === 'store-a') {
        customerQuery = condition
        return {
          _id: 'doc-1',
          _openid: 'u1',
          storeId: 'store-a',
          nickName: 'A用户',
          phone: '13800138000',
          memberLevel: 'vip',
          loginStatus: 'active',
          lastLoginAt: '2026-04-16T10:00:00Z',
          balance: 1500,
          totalEarned: 2100,
          totalInvited: 3
        }
      }
      if (collection === 'stores' && condition._id === 'store-a') {
        return { _id: 'store-a', staff: [] }
      }
      return null
    },
    safeList: async (collection, condition) => {
      if (collection === 'orders') {
        ordersQuery = condition
        return []
      }
      if (collection === 'customer_followups') {
        followupQuery = condition
        return []
      }
      if (collection === 'tongue_reports') {
        tongueQuery = condition
        return []
      }
      return []
    },
    fetchUsersMap: async () => ({}),
    _cmd: dbCommand
  })

  const restoreContext = mockModule(contextPath, {
    _cmd: dbCommand
  })

  try {
    const { getCustomerDetail } = require(leadsPath)
    const access = {
      uid: 'admin-1',
      account: { storeId: 'store-a', username: 'owner', displayName: '老板' }
    }
    const res = await getCustomerDetail(access, { openid: 'u1' })

    assert.equal(res.code, 0)
    assert.equal(customerQuery.storeId, 'store-a')
    assert.equal(customerQuery._openid, 'u1')
    assert.equal(ordersQuery.storeId, 'store-a')
    assert.equal(ordersQuery._openid, 'u1')
    assert.equal(followupQuery.storeId, 'store-a')
    assert.equal(followupQuery.leadOpenid, 'u1')
    assert.equal(tongueQuery.storeId, 'store-a')
    assert.equal(tongueQuery._openid, 'u1')
  } finally {
    restoreData()
    restoreContext()
    unloadModule(leadsPath)
  }
})
