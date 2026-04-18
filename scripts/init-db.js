#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const readline = require('readline')
const { execFileSync } = require('child_process')
const cloudbase = require('../admin-web/node_modules/@cloudbase/js-sdk/dist/index.cjs.js')

const { ADMIN_PERMISSION_KEYS } = require('../miniapp/cloudfunctions/adminApi/lib/admin-contract')

const DEFAULT_ENV_ID = 'your-cloudbase-env-id'
const DEFAULT_REGION = 'ap-shanghai'
const DEFAULT_STORE_ID = 'store_001'
const DEFAULT_STORE_NAME = '默认总店'
const DEFAULT_ADMIN_USERNAME = 'admin'
const DEFAULT_ADMIN_PASSWORD = ''
const DEFAULT_ADMIN_UID = 'admin_store_001'
const DEFAULT_ADMIN_DISPLAY_NAME = '系统超级管理员'
const MIN_ADMIN_PASSWORD_LENGTH = 12

const CORE_COLLECTIONS = [
  'stores',
  'users',
  'products',
  'packages',
  'orders',
  'order_items',
  'refund_requests',
  'fission_campaigns',
  'fission_records',
  'lottery_campaigns',
  'lottery_records',
  'tongue_reports',
  'package_usage',
  'customer_followups',
  'ai_config',
  'pay_config',
  'notification_settings',
  'admin_accounts',
  'admin_role_templates',
  'admin_login_events',
  'admin_audit_logs'
]

const DEFAULT_ROLE_TEMPLATES = [
  {
    roleKey: 'store-owner',
    roleName: '店长',
    role: 'owner',
    permissions: [...ADMIN_PERMISSION_KEYS]
  },
  {
    roleKey: 'therapist',
    roleName: '技师',
    role: 'therapist',
    permissions: ['orders.view', 'crm.view']
  },
  {
    roleKey: 'finance',
    roleName: '财务',
    role: 'finance',
    permissions: ['dashboard.view', 'orders.view', 'orders.refund.review', 'audit.view']
  }
]

const INDEX_SPECS = [
  { collectionName: 'users', indexName: 'users__openid_unique', keys: [{ field: '_openid', order: 'asc' }], unique: true },
  { collectionName: 'orders', indexName: 'orders__orderNo_unique', keys: [{ field: 'orderNo', order: 'asc' }], unique: true },
  { collectionName: 'admin_accounts', indexName: 'admin_accounts__uid_unique', keys: [{ field: 'uid', order: 'asc' }], unique: true },
  { collectionName: 'tongue_reports', indexName: 'tongue_reports__openid_createdAt', keys: [{ field: '_openid', order: 'asc' }, { field: 'createdAt', order: 'desc' }], unique: false },
  { collectionName: 'tongue_reports', indexName: 'tongue_reports__openid_isReviewMode_createdAt', keys: [{ field: '_openid', order: 'asc' }, { field: 'isReviewMode', order: 'asc' }, { field: 'createdAt', order: 'desc' }], unique: false }
]

function buildDefaultRoleTemplates(storeId = DEFAULT_STORE_ID) {
  return DEFAULT_ROLE_TEMPLATES.map(template => ({
    ...template,
    storeId
  }))
}

function requireEnvValue(source, key) {
  const value = trimValue(source[key])
  if (!value) {
    throw new Error(`缺少必填环境变量: ${key}`)
  }
  return value
}

function resolveBootstrapConfig(env = {}) {
  return {
    envId: requireEnvValue(env, 'TCB_ENV_ID'),
    secretId: requireEnvValue(env, 'CLOUDBASE_SECRET_ID'),
    secretKey: requireEnvValue(env, 'CLOUDBASE_SECRET_KEY'),
    admin: {
      uid: requireEnvValue(env, 'ADMIN_UID'),
      username: requireEnvValue(env, 'ADMIN_USERNAME'),
      displayName: requireEnvValue(env, 'ADMIN_DISPLAY_NAME')
    },
    store: {
      id: requireEnvValue(env, 'ADMIN_STORE_ID'),
      name: requireEnvValue(env, 'ADMIN_STORE_NAME')
    }
  }
}

function trimValue(value) {
  return String(value || '').trim()
}

function resolveOptionalValue(source, key, fallback) {
  const value = trimValue(source[key])
  return value || fallback
}

function isPlaceholderEnvId(value) {
  const normalized = trimValue(value)
  if (!normalized) return true
  return normalized === DEFAULT_ENV_ID
    || /your-production-env-id/i.test(normalized)
    || /your-cloudbase-env-id/i.test(normalized)
}

function readTextIfExists(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8')
  } catch (error) {
    return ''
  }
}

function loadEnvFile(filePath) {
  const text = readTextIfExists(filePath)
  const env = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eqIndex = line.indexOf('=')
    if (eqIndex <= 0) continue
    const key = line.slice(0, eqIndex).trim()
    const value = line.slice(eqIndex + 1).trim()
    env[key] = value
  }
  return env
}

function findPublishableKey(projectRoot) {
  const candidates = [
    process.env.VITE_CLOUDBASE_PUBLISHABLE_KEY,
    loadEnvFile(path.join(projectRoot, 'admin-web', '.env.production.local')).VITE_CLOUDBASE_PUBLISHABLE_KEY,
    loadEnvFile(path.join(projectRoot, 'admin-web', '.env.local')).VITE_CLOUDBASE_PUBLISHABLE_KEY
  ]

  for (const candidate of candidates) {
    const value = trimValue(candidate)
    if (value && !value.includes('your-publishable-key')) {
      return value
    }
  }
  throw new Error('未找到 CloudBase publishable key，请先在 admin-web/.env.production.local 或 admin-web/.env.local 中配置 VITE_CLOUDBASE_PUBLISHABLE_KEY')
}

function resolveEnvId(projectRoot) {
  const envCandidates = [
    process.env.TCB_ENV_ID,
    process.env.CLOUDBASE_ENV_ID
  ]

  for (const candidate of envCandidates) {
    const value = trimValue(candidate)
    if (value && !isPlaceholderEnvId(value)) return value
  }

  const cloudbaseRcPath = path.join(projectRoot, 'cloudbaserc.json')
  const rcText = readTextIfExists(cloudbaseRcPath)
  if (rcText) {
    try {
      const rc = JSON.parse(rcText)
      const value = trimValue(rc.envId)
      if (value && !isPlaceholderEnvId(value)) return value
    } catch (error) {
      // ignore malformed local config and continue fallback
    }
  }

  return ''
}

function validateAdminPassword(password) {
  const value = trimValue(password)
  if (!value) {
    throw new Error('缺少后台初始密码，请通过 ADMIN_PASSWORD 或交互式输入显式提供')
  }
  if (value.length < MIN_ADMIN_PASSWORD_LENGTH) {
    throw new Error(`后台初始密码至少需要 ${MIN_ADMIN_PASSWORD_LENGTH} 位`)
  }
  if (/^admin123$/i.test(value)) {
    throw new Error('后台初始密码不能继续使用已知弱口令')
  }
  return value
}

function promptHidden(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true
    })

    rl.stdoutMuted = true
    rl._writeToOutput = function _writeToOutput(stringToWrite) {
      if (!rl.stdoutMuted) {
        rl.output.write(stringToWrite)
        return
      }
      if (stringToWrite === '\r\n') {
        rl.output.write(stringToWrite)
        return
      }
      rl.output.write('*')
    }

    process.stdout.write(question)
    rl.question('', answer => {
      rl.close()
      process.stdout.write('\n')
      resolve(answer)
    })
  })
}

async function resolveAdminPassword(env = process.env) {
  const envPassword = trimValue(env.ADMIN_PASSWORD)
  if (envPassword) {
    return validateAdminPassword(envPassword)
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('缺少 ADMIN_PASSWORD；非交互模式下请通过环境变量显式提供')
  }

  const first = await promptHidden('请输入后台初始密码（不会回显）: ')
  const second = await promptHidden('请再次输入后台初始密码: ')

  if (first !== second) {
    throw new Error('两次输入的后台初始密码不一致')
  }

  return validateAdminPassword(first)
}

function resolveRuntimeBootstrapOptions(projectRoot, env = process.env) {
  const envId = resolveEnvId(projectRoot)
  if (!envId) {
    throw new Error(`缺少 CloudBase 环境 ID，请设置 TCB_ENV_ID / CLOUDBASE_ENV_ID，或将 cloudbaserc.json 中的 envId 从占位值改为真实环境 ID（当前占位值: ${DEFAULT_ENV_ID}）`)
  }

  return {
    envId,
    publishableKey: findPublishableKey(projectRoot),
    admin: {
      uid: resolveOptionalValue(env, 'ADMIN_UID', DEFAULT_ADMIN_UID),
      username: resolveOptionalValue(env, 'ADMIN_USERNAME', DEFAULT_ADMIN_USERNAME),
      displayName: resolveOptionalValue(env, 'ADMIN_DISPLAY_NAME', DEFAULT_ADMIN_DISPLAY_NAME)
    },
    store: {
      id: resolveOptionalValue(env, 'ADMIN_STORE_ID', DEFAULT_STORE_ID),
      name: resolveOptionalValue(env, 'ADMIN_STORE_NAME', DEFAULT_STORE_NAME)
    }
  }
}

function getTcbBin() {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || '', 'npm', 'tcb.cmd')
  }
  return 'tcb'
}

function quoteForPowerShell(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

function runTcb(args) {
  let raw
  if (process.platform === 'win32') {
    const command = `& ${quoteForPowerShell(getTcbBin())} ${args.map(quoteForPowerShell).join(' ')}`
    raw = execFileSync('powershell.exe', [
      '-NoProfile',
      '-Command',
      command
    ], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    })
  } else {
    raw = execFileSync(getTcbBin(), args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    })
  }
  const jsonStart = raw.indexOf('{')
  if (jsonStart >= 0) {
    return JSON.parse(raw.slice(jsonStart))
  }
  return raw
}

function runNoSql(envId, items) {
  const commandJson = JSON.stringify(items)

  if (process.platform === 'win32') {
    const psCommand = [
      `$json = @'`,
      commandJson,
      `'@`,
      `& ${quoteForPowerShell(getTcbBin())} 'db' 'nosql' 'execute' '-e' ${quoteForPowerShell(envId)} '--command' $json '--json'`
    ].join('\n')

    const raw = execFileSync('powershell.exe', [
      '-NoProfile',
      '-Command',
      psCommand
    ], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    })

    const jsonStart = raw.indexOf('{')
    if (jsonStart >= 0) {
      return JSON.parse(raw.slice(jsonStart))
    }
    return raw
  }

  return runTcb([
    'db',
    'nosql',
    'execute',
    '-e',
    envId,
    '--command',
    commandJson,
    '--json'
  ])
}

function queryOne(envId, tableName, filter) {
  const res = runNoSql(envId, [{
    TableName: tableName,
    CommandType: 'QUERY',
    Command: JSON.stringify({
      find: tableName,
      filter,
      limit: 1
    })
  }])

  const rows = (((res || {}).data || {}).results || [[]])[0] || []
  return rows[0] || null
}

function insertDocuments(envId, tableName, documents) {
  return runNoSql(envId, [{
    TableName: tableName,
    CommandType: 'INSERT',
    Command: JSON.stringify({
      insert: tableName,
      documents
    })
  }])
}

function updateDocuments(envId, tableName, updates) {
  return runNoSql(envId, [{
    TableName: tableName,
    CommandType: 'UPDATE',
    Command: JSON.stringify({
      update: tableName,
      updates
    })
  }])
}

function deleteDocuments(envId, tableName, deletes) {
  return runNoSql(envId, [{
    TableName: tableName,
    CommandType: 'DELETE',
    Command: JSON.stringify({
      delete: tableName,
      deletes
    })
  }])
}

function ensureCollections(envId) {
  console.log(`\n[1/4] 创建或唤醒核心集合 (${CORE_COLLECTIONS.length} 个)`)
  for (const tableName of CORE_COLLECTIONS) {
    const tempId = `__bootstrap__${tableName}`
    try {
      insertDocuments(envId, tableName, [{ _id: tempId, __bootstrapTemp: true }])
      console.log(`  + 已确保集合可用: ${tableName}`)
    } catch (error) {
      console.log(`  - 集合已存在: ${tableName}`)
    }
    try {
      deleteDocuments(envId, tableName, [{ q: { _id: tempId }, limit: 1 }])
    } catch (error) {
      // ignore cleanup failures for non-existing temp records
    }
  }
}

function getCloudbaseAuthClient(envId, publishableKey) {
  const app = cloudbase.init({
    env: envId,
    region: DEFAULT_REGION,
    accessKey: publishableKey,
    auth: { detectSessionInUrl: false }
  })
  return app.auth()
}

async function ensureAdminAuthUser(envId, publishableKey, admin) {
  console.log('\n[2/4] 创建或确认后台登录用户')
  const auth = getCloudbaseAuthClient(envId, publishableKey)

  let signInRes = await auth.signInWithPassword({
    username: admin.username,
    password: admin.password
  })

  if (!signInRes.error) {
    const uid = trimValue(signInRes?.data?.user?.id || signInRes?.data?.session?.user?.id)
    console.log(`  - 后台登录用户已存在: ${admin.username}`)
    return { uid: uid || admin.uid, username: admin.username }
  }

  const signUpRes = await auth.signUp({
    username: admin.username,
    password: admin.password
  })

  if (signUpRes.error) {
    const message = signUpRes.error.message || '未知错误'
    if (/exist|exists|已存在|duplicate/i.test(message)) {
      throw new Error(`后台登录用户 ${admin.username} 已存在，但提供的密码无法登录；请确认 ADMIN_PASSWORD 或交互式输入的密码是否正确`)
    }
    throw new Error(`创建后台登录用户失败: ${message}`)
  }

  signInRes = await auth.signInWithPassword({
    username: admin.username,
    password: admin.password
  })

  if (signInRes.error) {
    throw new Error(`创建用户后自动登录失败: ${signInRes.error.message || '未知错误'}`)
  }

  const uid = trimValue(signInRes?.data?.user?.id || signInRes?.data?.session?.user?.id)
  console.log(`  + 已创建后台登录用户: ${admin.username}`)
  return { uid: uid || admin.uid, username: admin.username }
}

function ensureDefaultStore(envId, store, nowIso) {
  console.log('\n[3/4] 初始化默认门店')
  updateDocuments(envId, 'stores', [{
    q: { _id: store.id },
    u: {
      $set: {
        name: store.name,
        phone: '',
        address: '',
        latitude: 0,
        longitude: 0,
        description: '系统初始化默认门店',
        logo: '',
        banners: [],
        adminOpenids: [],
        staff: [],
        createdAt: nowIso,
        updatedAt: nowIso
      }
    },
    multi: false,
    upsert: true
  }])
  console.log(`  + 门店已就绪: ${store.id} / ${store.name}`)
}

function ensureAdminRecords(envId, admin, store, nowIso) {
  console.log('\n[4/4] 写入管理员映射和角色模板')

  updateDocuments(envId, 'users', [{
    q: { _id: admin.uid, uid: admin.uid },
    u: {
      $set: {
        _openid: '',
        nickName: admin.displayName,
        avatarUrl: '',
        phone: '',
        invitedBy: '',
        balance: 0,
        totalEarned: 0,
        totalInvited: 0,
        memberLevel: 'vip',
        role: 'owner',
        permissions: [...ADMIN_PERMISSION_KEYS],
        storeId: store.id,
        createdAt: nowIso,
        updatedAt: nowIso
      }
    },
    multi: false,
    upsert: true
  }])
  console.log('  + users 已写入管理员档案')

  updateDocuments(envId, 'admin_accounts', [{
    q: { uid: admin.uid },
    u: {
      $set: {
        username: admin.username,
        displayName: admin.displayName,
        role: 'owner',
        permissions: [...ADMIN_PERMISSION_KEYS],
        storeId: store.id,
        status: 'active',
        lastLoginAt: null,
        createdAt: nowIso,
        updatedAt: nowIso
      }
    },
    multi: false,
    upsert: true
  }])
  console.log('  + admin_accounts 已写入管理员权限')

  for (const template of buildDefaultRoleTemplates(store.id)) {
    updateDocuments(envId, 'admin_role_templates', [{
      q: {
        storeId: store.id,
        roleKey: template.roleKey
      },
      u: {
        $set: {
          roleName: template.roleName,
          role: template.role,
          permissions: template.permissions,
          isSystem: false,
          status: 'active',
          createdAt: nowIso,
          updatedAt: nowIso
        }
      },
      multi: false,
      upsert: true
    }])
    console.log(`  + 角色模板已写入: ${template.roleName}`)
  }
}

function printUsage() {
  console.log('数据库 bootstrap 脚本（傻瓜版）')
  console.log('')
  console.log('默认行为：')
  console.log('  - 环境 ID: 从 TCB_ENV_ID / CLOUDBASE_ENV_ID 读取，或使用 cloudbaserc.json 中的非占位值')
  console.log(`  - 后台账号: 默认 ${DEFAULT_ADMIN_USERNAME}，可通过 ADMIN_USERNAME 覆盖`)
  console.log(`  - 后台密码: 必须通过 ADMIN_PASSWORD 或交互式输入显式提供，且不会打印到日志`)
  console.log(`  - 默认门店: ${DEFAULT_STORE_ID} / ${DEFAULT_STORE_NAME}，可通过 ADMIN_STORE_ID / ADMIN_STORE_NAME 覆盖`)
  console.log('')
  console.log('可选环境变量：')
  console.log('  TCB_ENV_ID / CLOUDBASE_ENV_ID')
  console.log('  VITE_CLOUDBASE_PUBLISHABLE_KEY')
  console.log('  ADMIN_PASSWORD')
  console.log('  ADMIN_UID / ADMIN_USERNAME / ADMIN_DISPLAY_NAME')
  console.log('  ADMIN_STORE_ID / ADMIN_STORE_NAME')
  console.log('')
  console.log('前置要求：')
  console.log('  1. 已执行 tcb login')
  console.log('  2. 当前环境已开启 CloudBase 用户名密码登录')
  console.log('  3. admin-web/.env.production.local 或 admin-web/.env.local 中已配置 publishable key')
}

async function runBootstrap() {
  const projectRoot = path.resolve(__dirname, '..')
  const runtimeOptions = resolveRuntimeBootstrapOptions(projectRoot)
  const adminPassword = await resolveAdminPassword(process.env)
  const nowIso = new Date().toISOString()

  console.log('开始执行数据库 bootstrap...')
  console.log(`目标环境: ${runtimeOptions.envId}`)

  ensureCollections(runtimeOptions.envId)
  const adminUser = await ensureAdminAuthUser(runtimeOptions.envId, runtimeOptions.publishableKey, {
    ...runtimeOptions.admin,
    password: adminPassword
  })
  ensureDefaultStore(runtimeOptions.envId, runtimeOptions.store, nowIso)
  ensureAdminRecords(runtimeOptions.envId, {
    ...runtimeOptions.admin,
    uid: adminUser.uid
  }, runtimeOptions.store, nowIso)

  console.log('\n数据库 bootstrap 完成。')
  console.log(`后台账号: ${adminUser.username}`)
  console.log(`管理员 UID: ${adminUser.uid}`)
  console.log(`默认门店: ${runtimeOptions.store.id} / ${runtimeOptions.store.name}`)
}

if (require.main === module) {
  if (process.argv.includes('--help')) {
    printUsage()
    process.exit(0)
  }

  runBootstrap().catch(error => {
    console.error('\n数据库 bootstrap 失败:')
    console.error(error && error.stack ? error.stack : error)
    printUsage()
    process.exit(1)
  })
}

module.exports = {
  CORE_COLLECTIONS,
  INDEX_SPECS,
  ADMIN_PERMISSION_KEYS,
  DEFAULT_ROLE_TEMPLATES,
  DEFAULT_ENV_ID,
  DEFAULT_STORE_ID,
  DEFAULT_STORE_NAME,
  DEFAULT_ADMIN_USERNAME,
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_ADMIN_UID,
  DEFAULT_ADMIN_DISPLAY_NAME,
  buildDefaultRoleTemplates,
  resolveBootstrapConfig,
  resolveEnvId,
  resolveAdminPassword,
  findPublishableKey,
  runBootstrap
}
