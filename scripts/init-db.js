#!/usr/bin/env node

const CloudBaseManager = require('@cloudbase/manager-node')
const tcb = require('@cloudbase/node-sdk')

const { ADMIN_PERMISSION_KEYS } = require('../miniapp/cloudfunctions/adminApi/lib/admin-contract')

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

const INDEX_SPECS = [
  { collection: 'users', indexName: 'users__openid_unique', keys: [{ name: '_openid', direction: '1' }], unique: true },
  { collection: 'orders', indexName: 'orders__openid_status', keys: [{ name: '_openid', direction: '1' }, { name: 'status', direction: '1' }], unique: false },
  { collection: 'orders', indexName: 'orders__orderNo_unique', keys: [{ name: 'orderNo', direction: '1' }], unique: true },
  { collection: 'orders', indexName: 'orders__createdAt', keys: [{ name: 'createdAt', direction: '-1' }], unique: false },
  { collection: 'order_items', indexName: 'order_items__orderId', keys: [{ name: 'orderId', direction: '1' }], unique: false },
  { collection: 'order_items', indexName: 'order_items__openid_productType', keys: [{ name: '_openid', direction: '1' }, { name: 'productType', direction: '1' }], unique: false },
  { collection: 'order_items', indexName: 'order_items__verifyCode', keys: [{ name: 'verifyCode', direction: '1' }], unique: false },
  { collection: 'fission_records', indexName: 'fission_records__inviterOpenid', keys: [{ name: 'inviterOpenid', direction: '1' }], unique: false },
  { collection: 'fission_records', indexName: 'fission_records__inviteeOpenid', keys: [{ name: 'inviteeOpenid', direction: '1' }], unique: false },
  { collection: 'fission_records', indexName: 'fission_records__campaignId', keys: [{ name: 'campaignId', direction: '1' }], unique: false },
  { collection: 'tongue_reports', indexName: 'tongue_reports__openid_createdAt', keys: [{ name: '_openid', direction: '1' }, { name: 'createdAt', direction: '-1' }], unique: false },
  { collection: 'fission_campaigns', indexName: 'fission_campaigns__status_start_end', keys: [{ name: 'status', direction: '1' }, { name: 'startTime', direction: '1' }, { name: 'endTime', direction: '1' }], unique: false },
  { collection: 'products', indexName: 'products__store_status_sort', keys: [{ name: 'storeId', direction: '1' }, { name: 'status', direction: '1' }, { name: 'sortOrder', direction: '1' }], unique: false },
  { collection: 'package_usage', indexName: 'package_usage__orderItemId', keys: [{ name: 'orderItemId', direction: '1' }], unique: false },
  { collection: 'admin_accounts', indexName: 'admin_accounts__uid_unique', keys: [{ name: 'uid', direction: '1' }], unique: true },
  { collection: 'admin_accounts', indexName: 'admin_accounts__username', keys: [{ name: 'username', direction: '1' }], unique: false },
  { collection: 'admin_accounts', indexName: 'admin_accounts__store_status', keys: [{ name: 'storeId', direction: '1' }, { name: 'status', direction: '1' }], unique: false },
  { collection: 'admin_login_events', indexName: 'admin_login_events__uid_createdAt', keys: [{ name: 'uid', direction: '1' }, { name: 'createdAt', direction: '-1' }], unique: false },
  { collection: 'admin_login_events', indexName: 'admin_login_events__username_createdAt', keys: [{ name: 'username', direction: '1' }, { name: 'createdAt', direction: '-1' }], unique: false },
  { collection: 'admin_login_events', indexName: 'admin_login_events__store_createdAt', keys: [{ name: 'storeId', direction: '1' }, { name: 'createdAt', direction: '-1' }], unique: false },
  { collection: 'admin_audit_logs', indexName: 'admin_audit_logs__store_createdAt', keys: [{ name: 'storeId', direction: '1' }, { name: 'createdAt', direction: '-1' }], unique: false },
  { collection: 'admin_audit_logs', indexName: 'admin_audit_logs__actorUid_createdAt', keys: [{ name: 'actorUid', direction: '1' }, { name: 'createdAt', direction: '-1' }], unique: false },
  { collection: 'admin_audit_logs', indexName: 'admin_audit_logs__module_createdAt', keys: [{ name: 'module', direction: '1' }, { name: 'createdAt', direction: '-1' }], unique: false },
  { collection: 'notification_settings', indexName: 'notification_settings__storeId', keys: [{ name: 'storeId', direction: '1' }], unique: false }
]

function trimValue(value) {
  return String(value || '').trim()
}

function pickEnv(env, keys) {
  for (const key of keys) {
    const value = trimValue(env[key])
    if (value) return value
  }
  return ''
}

function requireEnvValue(env, keys, label) {
  const value = pickEnv(env, keys)
  if (!value) {
    throw new Error(`缺少环境变量 ${label}`)
  }
  return value
}

function buildDefaultRoleTemplates(storeId) {
  const now = new Date()
  return [
    {
      roleKey: 'store-owner',
      roleName: '店长',
      role: 'owner',
      permissions: [...ADMIN_PERMISSION_KEYS],
      isSystem: false,
      storeId,
      status: 'active',
      createdAt: now,
      updatedAt: now
    },
    {
      roleKey: 'therapist',
      roleName: '技师',
      role: 'therapist',
      permissions: ['orders.view', 'crm.view'],
      isSystem: false,
      storeId,
      status: 'active',
      createdAt: now,
      updatedAt: now
    },
    {
      roleKey: 'finance',
      roleName: '财务',
      role: 'finance',
      permissions: ['dashboard.view', 'orders.view', 'orders.refund.review', 'audit.view'],
      isSystem: false,
      storeId,
      status: 'active',
      createdAt: now,
      updatedAt: now
    }
  ]
}

function resolveBootstrapConfig(env = process.env) {
  const envId = requireEnvValue(env, ['TCB_ENV_ID', 'CLOUDBASE_ENV_ID'], 'TCB_ENV_ID')
  const secretId = requireEnvValue(env, ['CLOUDBASE_SECRET_ID', 'TENCENTCLOUD_SECRETID'], 'CLOUDBASE_SECRET_ID')
  const secretKey = requireEnvValue(env, ['CLOUDBASE_SECRET_KEY', 'TENCENTCLOUD_SECRETKEY'], 'CLOUDBASE_SECRET_KEY')
  const sessionToken = pickEnv(env, ['CLOUDBASE_SESSION_TOKEN', 'TENCENTCLOUD_SESSIONTOKEN'])
  const region = pickEnv(env, ['TCB_REGION', 'CLOUDBASE_REGION']) || 'ap-shanghai'

  const admin = {
    uid: requireEnvValue(env, ['ADMIN_UID'], 'ADMIN_UID'),
    username: requireEnvValue(env, ['ADMIN_USERNAME'], 'ADMIN_USERNAME'),
    displayName: requireEnvValue(env, ['ADMIN_DISPLAY_NAME'], 'ADMIN_DISPLAY_NAME'),
    storeId: requireEnvValue(env, ['ADMIN_STORE_ID'], 'ADMIN_STORE_ID'),
    role: pickEnv(env, ['ADMIN_ROLE']) || 'owner',
    status: 'active'
  }

  return {
    envId,
    secretId,
    secretKey,
    sessionToken,
    region,
    admin,
    store: {
      id: admin.storeId,
      name: pickEnv(env, ['ADMIN_STORE_NAME', 'STORE_NAME']),
      phone: pickEnv(env, ['ADMIN_STORE_PHONE', 'STORE_PHONE']),
      address: pickEnv(env, ['ADMIN_STORE_ADDRESS', 'STORE_ADDRESS']),
      description: pickEnv(env, ['ADMIN_STORE_DESCRIPTION', 'STORE_DESCRIPTION'])
    }
  }
}

function createClients(config) {
  const commonConfig = {
    secretId: config.secretId,
    secretKey: config.secretKey,
    sessionToken: config.sessionToken || undefined,
    env: config.envId,
    envId: config.envId,
    region: config.region
  }

  const manager = CloudBaseManager.init({
    secretId: commonConfig.secretId,
    secretKey: commonConfig.secretKey,
    token: commonConfig.sessionToken,
    envId: commonConfig.envId,
    region: commonConfig.region
  })
  const app = tcb.init(commonConfig)
  const db = app.database()

  return { manager, db }
}

async function getFirstByQuery(db, collectionName, query) {
  const res = await db.collection(collectionName).where(query).limit(1).get()
  return Array.isArray(res.data) ? (res.data[0] || null) : null
}

async function ensureCollections(manager) {
  console.log(`\n[1/4] 检查并创建集合 (${CORE_COLLECTIONS.length} 个)`)
  for (const collectionName of CORE_COLLECTIONS) {
    const result = await manager.database.createCollectionIfNotExists(collectionName)
    if (result.IsCreated) {
      console.log(`  + 已创建集合: ${collectionName}`)
    } else {
      console.log(`  - 集合已存在: ${collectionName}`)
    }
  }
}

async function ensureIndexes(manager) {
  console.log(`\n[2/4] 检查并创建建议索引 (${INDEX_SPECS.length} 个)`)
  for (const spec of INDEX_SPECS) {
    const exists = await manager.database.checkIndexExists(spec.collection, spec.indexName)
    if (exists.Exists) {
      console.log(`  - 索引已存在: ${spec.indexName}`)
      continue
    }

    await manager.database.updateCollection(spec.collection, {
      CreateIndexes: [
        {
          IndexName: spec.indexName,
          MgoKeySchema: {
            MgoIndexKeys: spec.keys.map(item => ({
              Name: item.name,
              Direction: item.direction
            })),
            MgoIsUnique: Boolean(spec.unique)
          }
        }
      ]
    })

    console.log(`  + 已创建索引: ${spec.indexName}`)
  }
}

async function ensureStore(db, config) {
  console.log('\n[3/4] 检查门店基础数据')
  let store = await getFirstByQuery(db, 'stores', { _id: config.store.id })
  if (store) {
    console.log(`  - 门店已存在: ${config.store.id}`)
    return store
  }

  if (!config.store.name) {
    throw new Error('目标门店不存在，且未提供 ADMIN_STORE_NAME，无法创建 stores 记录')
  }

  const now = new Date()
  const payload = {
    _id: config.store.id,
    name: config.store.name,
    logo: '',
    address: config.store.address || '',
    latitude: 0,
    longitude: 0,
    phone: config.store.phone || '',
    banners: [],
    description: config.store.description || '',
    adminOpenids: [],
    createdAt: now,
    updatedAt: now
  }

  await db.collection('stores').add(payload)
  console.log(`  + 已创建门店: ${config.store.id}`)
  store = await getFirstByQuery(db, 'stores', { _id: config.store.id })
  return store || payload
}

async function ensureAdminAccount(db, config) {
  console.log('\n[4/4] 初始化首个后台管理员与角色模板')
  const existing = await getFirstByQuery(db, 'admin_accounts', { uid: config.admin.uid })
  const now = new Date()

  if (existing) {
    const updateData = {
      username: config.admin.username,
      displayName: config.admin.displayName,
      role: config.admin.role,
      storeId: config.admin.storeId,
      status: 'active',
      permissions: [...ADMIN_PERMISSION_KEYS],
      updatedAt: now
    }
    await db.collection('admin_accounts').doc(existing._id).update(updateData)
    console.log(`  - 已更新管理员账号: ${config.admin.uid}`)
  } else {
    await db.collection('admin_accounts').add({
      uid: config.admin.uid,
      username: config.admin.username,
      displayName: config.admin.displayName,
      role: config.admin.role,
      storeId: config.admin.storeId,
      status: 'active',
      permissions: [...ADMIN_PERMISSION_KEYS],
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now
    })
    console.log(`  + 已创建管理员账号: ${config.admin.uid}`)
  }

  const templates = buildDefaultRoleTemplates(config.admin.storeId)
  for (const template of templates) {
    const existingTemplate = await getFirstByQuery(db, 'admin_role_templates', {
      storeId: config.admin.storeId,
      roleKey: template.roleKey
    })

    if (existingTemplate) {
      await db.collection('admin_role_templates').doc(existingTemplate._id).update({
        roleName: template.roleName,
        role: template.role,
        permissions: template.permissions,
        isSystem: false,
        storeId: template.storeId,
        status: template.status,
        updatedAt: now
      })
      console.log(`  - 已更新角色模板: ${template.roleName}`)
    } else {
      await db.collection('admin_role_templates').add(template)
      console.log(`  + 已创建角色模板: ${template.roleName}`)
    }
  }
}

async function runBootstrap(env = process.env) {
  const config = resolveBootstrapConfig(env)
  const { manager, db } = createClients(config)

  console.log('开始执行数据库 bootstrap...')
  console.log(`目标环境: ${config.envId}`)
  console.log(`目标门店: ${config.admin.storeId}`)
  console.log(`管理员 UID: ${config.admin.uid}`)

  await ensureCollections(manager)
  await ensureIndexes(manager)
  await ensureStore(db, config)
  await ensureAdminAccount(db, config)

  console.log('\n数据库 bootstrap 完成。')
  console.log('仍需人工补齐的敏感配置：pay_config、ai_config、notification_settings 中的真实生产参数。')
}

function printUsage() {
  console.log('数据库 bootstrap 脚本')
  console.log('')
  console.log('运行前请配置以下环境变量：')
  console.log('  TCB_ENV_ID / CLOUDBASE_ENV_ID')
  console.log('  CLOUDBASE_SECRET_ID / TENCENTCLOUD_SECRETID')
  console.log('  CLOUDBASE_SECRET_KEY / TENCENTCLOUD_SECRETKEY')
  console.log('  ADMIN_UID')
  console.log('  ADMIN_USERNAME')
  console.log('  ADMIN_DISPLAY_NAME')
  console.log('  ADMIN_STORE_ID')
  console.log('')
  console.log('可选环境变量：')
  console.log('  CLOUDBASE_SESSION_TOKEN / TENCENTCLOUD_SESSIONTOKEN')
  console.log('  TCB_REGION / CLOUDBASE_REGION')
  console.log('  ADMIN_ROLE             默认 owner')
  console.log('  ADMIN_STORE_NAME       门店不存在时用于自动创建 stores 记录')
  console.log('  ADMIN_STORE_PHONE')
  console.log('  ADMIN_STORE_ADDRESS')
  console.log('  ADMIN_STORE_DESCRIPTION')
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
  buildDefaultRoleTemplates,
  resolveBootstrapConfig,
  runBootstrap
}
