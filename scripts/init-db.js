#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const cloudbase = require('../admin-web/node_modules/@cloudbase/js-sdk/dist/index.cjs.js')

const { ADMIN_PERMISSION_KEYS } = require('../miniapp/cloudfunctions/adminApi/lib/admin-contract')

const DEFAULT_ENV_ID = 'yuxiaozhu111-4ga6qic990d1eb4e'
const DEFAULT_REGION = 'ap-shanghai'
const DEFAULT_STORE_ID = 'store_001'
const DEFAULT_STORE_NAME = '默认总店'
const DEFAULT_ADMIN_USERNAME = 'admin'
const DEFAULT_ADMIN_PASSWORD = 'Admin123'
const DEFAULT_ADMIN_UID = 'admin_store_001'
const DEFAULT_ADMIN_DISPLAY_NAME = '系统超级管理员'

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

function trimValue(value) {
  return String(value || '').trim()
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
    if (value) return value
  }

  const cloudbaseRcPath = path.join(projectRoot, 'cloudbaserc.json')
  const rcText = readTextIfExists(cloudbaseRcPath)
  if (rcText) {
    try {
      const rc = JSON.parse(rcText)
      const value = trimValue(rc.envId)
      if (value && !value.includes('your-production-env-id')) return value
    } catch (error) {
      // ignore malformed local config and continue fallback
    }
  }

  return DEFAULT_ENV_ID
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

async function ensureAdminAuthUser(envId, publishableKey) {
  console.log('\n[2/4] 创建或确认后台登录用户')
  const auth = getCloudbaseAuthClient(envId, publishableKey)

  let signInRes = await auth.signInWithPassword({
    username: DEFAULT_ADMIN_USERNAME,
    password: DEFAULT_ADMIN_PASSWORD
  })

  if (!signInRes.error) {
    const uid = trimValue(signInRes?.data?.user?.id || signInRes?.data?.session?.user?.id)
    console.log(`  - 后台登录用户已存在: ${DEFAULT_ADMIN_USERNAME}`)
    return { uid: uid || DEFAULT_ADMIN_UID, username: DEFAULT_ADMIN_USERNAME, password: DEFAULT_ADMIN_PASSWORD }
  }

  const signUpRes = await auth.signUp({
    username: DEFAULT_ADMIN_USERNAME,
    password: DEFAULT_ADMIN_PASSWORD
  })

  if (signUpRes.error) {
    throw new Error(`创建后台登录用户失败: ${signUpRes.error.message || '未知错误'}`)
  }

  signInRes = await auth.signInWithPassword({
    username: DEFAULT_ADMIN_USERNAME,
    password: DEFAULT_ADMIN_PASSWORD
  })

  if (signInRes.error) {
    throw new Error(`创建用户后自动登录失败: ${signInRes.error.message || '未知错误'}`)
  }

  const uid = trimValue(signInRes?.data?.user?.id || signInRes?.data?.session?.user?.id)
  console.log(`  + 已创建后台登录用户: ${DEFAULT_ADMIN_USERNAME}`)
  return { uid: uid || DEFAULT_ADMIN_UID, username: DEFAULT_ADMIN_USERNAME, password: DEFAULT_ADMIN_PASSWORD }
}

function ensureDefaultStore(envId, nowIso) {
  console.log('\n[3/4] 初始化默认门店')
  updateDocuments(envId, 'stores', [{
    q: { _id: DEFAULT_STORE_ID },
    u: {
      $set: {
        name: DEFAULT_STORE_NAME,
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
  console.log(`  + 门店已就绪: ${DEFAULT_STORE_ID} / ${DEFAULT_STORE_NAME}`)
}

function ensureAdminRecords(envId, adminUid, nowIso) {
  console.log('\n[4/4] 写入管理员映射和角色模板')

  updateDocuments(envId, 'users', [{
    q: { _id: adminUid, uid: adminUid },
    u: {
      $set: {
        _openid: '',
        nickName: DEFAULT_ADMIN_DISPLAY_NAME,
        avatarUrl: '',
        phone: '',
        invitedBy: '',
        balance: 0,
        totalEarned: 0,
        totalInvited: 0,
        memberLevel: 'vip',
        role: 'owner',
        permissions: [...ADMIN_PERMISSION_KEYS],
        storeId: DEFAULT_STORE_ID,
        createdAt: nowIso,
        updatedAt: nowIso
      }
    },
    multi: false,
    upsert: true
  }])
  console.log('  + users 已写入管理员档案')

  updateDocuments(envId, 'admin_accounts', [{
    q: { uid: adminUid },
    u: {
      $set: {
        username: DEFAULT_ADMIN_USERNAME,
        displayName: DEFAULT_ADMIN_DISPLAY_NAME,
        role: 'owner',
        permissions: [...ADMIN_PERMISSION_KEYS],
        storeId: DEFAULT_STORE_ID,
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

  for (const template of DEFAULT_ROLE_TEMPLATES) {
    updateDocuments(envId, 'admin_role_templates', [{
      q: {
        storeId: DEFAULT_STORE_ID,
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
  console.log(`  - 环境 ID: 自动识别，识别不到时回退为 ${DEFAULT_ENV_ID}`)
  console.log(`  - 后台账号: ${DEFAULT_ADMIN_USERNAME}`)
  console.log(`  - 后台密码: ${DEFAULT_ADMIN_PASSWORD}`)
  console.log(`  - 默认门店: ${DEFAULT_STORE_ID} / ${DEFAULT_STORE_NAME}`)
  console.log('')
  console.log('可选环境变量：')
  console.log('  TCB_ENV_ID / CLOUDBASE_ENV_ID')
  console.log('  VITE_CLOUDBASE_PUBLISHABLE_KEY')
  console.log('')
  console.log('前置要求：')
  console.log('  1. 已执行 tcb login')
  console.log('  2. 当前环境已开启 CloudBase 用户名密码登录')
  console.log('  3. admin-web/.env.production.local 或 admin-web/.env.local 中已配置 publishable key')
}

async function runBootstrap() {
  const projectRoot = path.resolve(__dirname, '..')
  const envId = resolveEnvId(projectRoot)
  const publishableKey = findPublishableKey(projectRoot)
  const nowIso = new Date().toISOString()

  console.log('开始执行数据库 bootstrap...')
  console.log(`目标环境: ${envId}`)

  ensureCollections(envId)
  const adminUser = await ensureAdminAuthUser(envId, publishableKey)
  ensureDefaultStore(envId, nowIso)
  ensureAdminRecords(envId, adminUser.uid, nowIso)

  console.log('\n数据库 bootstrap 完成。')
  console.log(`后台账号: ${adminUser.username}`)
  console.log(`后台密码: ${adminUser.password}`)
  console.log(`管理员 UID: ${adminUser.uid}`)
  console.log(`默认门店: ${DEFAULT_STORE_ID} / ${DEFAULT_STORE_NAME}`)
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
  DEFAULT_ROLE_TEMPLATES,
  DEFAULT_ENV_ID,
  DEFAULT_STORE_ID,
  DEFAULT_STORE_NAME,
  DEFAULT_ADMIN_USERNAME,
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_ADMIN_UID,
  DEFAULT_ADMIN_DISPLAY_NAME,
  resolveEnvId,
  findPublishableKey,
  runBootstrap
}
