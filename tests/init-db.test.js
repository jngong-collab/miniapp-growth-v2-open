const test = require('node:test')
const assert = require('node:assert/strict')

const {
  CORE_COLLECTIONS,
  INDEX_SPECS,
  ADMIN_PERMISSION_KEYS,
  buildDefaultRoleTemplates,
  resolveBootstrapConfig
} = require('../scripts/init-db')

test('init-db exposes the 2.0 core collections and suggested indexes', () => {
  assert.ok(CORE_COLLECTIONS.includes('stores'))
  assert.ok(CORE_COLLECTIONS.includes('admin_accounts'))
  assert.ok(CORE_COLLECTIONS.includes('admin_role_templates'))
  assert.ok(CORE_COLLECTIONS.includes('lottery_campaigns'))
  assert.ok(CORE_COLLECTIONS.includes('notification_settings'))

  const indexNames = INDEX_SPECS.map(item => item.indexName)
  assert.ok(indexNames.includes('users__openid_unique'))
  assert.ok(indexNames.includes('orders__orderNo_unique'))
  assert.ok(indexNames.includes('admin_accounts__uid_unique'))
})

test('init-db builds default role templates from the current admin permissions contract', () => {
  const templates = buildDefaultRoleTemplates('store-demo')
  const owner = templates.find(item => item.roleKey === 'store-owner')
  const therapist = templates.find(item => item.roleKey === 'therapist')
  const finance = templates.find(item => item.roleKey === 'finance')

  assert.equal(templates.length, 3)
  assert.deepEqual(owner.permissions, ADMIN_PERMISSION_KEYS)
  assert.deepEqual(therapist.permissions, ['orders.view', 'crm.view'])
  assert.deepEqual(finance.permissions, ['dashboard.view', 'orders.view', 'orders.refund.review', 'audit.view'])
  assert.equal(therapist.storeId, 'store-demo')
})

test('init-db validates the required environment variables for bootstrap', () => {
  assert.throws(() => resolveBootstrapConfig({}), /TCB_ENV_ID/)

  const config = resolveBootstrapConfig({
    TCB_ENV_ID: 'env-demo',
    CLOUDBASE_SECRET_ID: 'secret-id',
    CLOUDBASE_SECRET_KEY: 'secret-key',
    ADMIN_UID: 'uid-demo',
    ADMIN_USERNAME: 'boss-demo',
    ADMIN_DISPLAY_NAME: '老板',
    ADMIN_STORE_ID: 'store-demo',
    ADMIN_STORE_NAME: '示例门店'
  })

  assert.equal(config.envId, 'env-demo')
  assert.equal(config.admin.uid, 'uid-demo')
  assert.equal(config.admin.username, 'boss-demo')
  assert.equal(config.store.name, '示例门店')
})
