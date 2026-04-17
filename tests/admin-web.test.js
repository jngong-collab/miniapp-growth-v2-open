const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const repoRoot = path.resolve(__dirname, '..')

test('admin contract exposes dotted permission keys, route map, and deny-by-default normalization', () => {
  const {
    ADMIN_PERMISSION_KEYS,
    ADMIN_ROUTE_PERMISSIONS
  } = require('../miniapp/cloudfunctions/adminApi/lib/admin-contract')
  const {
    buildAdminAccountRecord,
    canManagePermission,
    normalizeAdminPermissions
  } = require('../miniapp/cloudfunctions/adminApi/lib/admin-access')

  const serverDate = Symbol('serverDate')
  const record = buildAdminAccountRecord({
    uid: 'uid-owner-1',
    username: 'boss-demo',
    storeId: 'store-1',
    displayName: '老板'
  }, serverDate)

  assert.equal(record.uid, 'uid-owner-1')
  assert.equal(record.username, 'boss-demo')
  assert.equal(record.storeId, 'store-1')
  assert.equal(record.displayName, '老板')
  assert.equal(record.role, 'owner')
  assert.equal(record.status, 'active')
  assert.equal(record.lastLoginAt, null)
  assert.deepEqual(ADMIN_PERMISSION_KEYS, [
    'dashboard.view',
    'orders.view',
    'orders.refund.review',
    'catalog.manage',
    'campaigns.manage',
    'crm.view',
    'settings.manage',
    'staff.manage',
    'audit.view'
  ])
  assert.equal(ADMIN_ROUTE_PERMISSIONS['/dashboard'], 'dashboard.view')
  assert.equal(ADMIN_ROUTE_PERMISSIONS['/orders'], 'orders.view')
  assert.equal(ADMIN_ROUTE_PERMISSIONS['/verification'], 'orders.view')
  assert.equal(ADMIN_ROUTE_PERMISSIONS['/catalog'], 'catalog.manage')
  assert.equal(ADMIN_ROUTE_PERMISSIONS['/campaigns'], 'campaigns.manage')
  assert.equal(ADMIN_ROUTE_PERMISSIONS['/leads'], 'crm.view')
  assert.equal(ADMIN_ROUTE_PERMISSIONS['/customers'], 'crm.view')
  assert.equal(ADMIN_ROUTE_PERMISSIONS['/finance'], 'orders.refund.review')
  assert.equal(ADMIN_ROUTE_PERMISSIONS['/settings'], 'settings.manage')
  assert.equal(ADMIN_ROUTE_PERMISSIONS['/ops'], 'staff.manage')
  assert.equal(ADMIN_ROUTE_PERMISSIONS['/staff'], 'staff.manage')
  assert.deepEqual(record.permissions, [])
  assert.equal(record.createdAt, serverDate)
  assert.equal(record.updatedAt, serverDate)

  assert.deepEqual(normalizeAdminPermissions(undefined), [])
  assert.deepEqual(normalizeAdminPermissions([]), [])
  assert.deepEqual(normalizeAdminPermissions(['dashboard.view', 'dashboard.view', 'unknown']), ['dashboard.view'])

  assert.equal(canManagePermission(['catalog.manage'], 'catalog.manage'), true)
  assert.equal(canManagePermission(['orders.view'], 'orders.refund.review'), false)
  assert.equal(canManagePermission([], 'catalog.manage'), false)
})

test('admin audit log builder creates normalized operation entries', () => {
  const { buildAdminAuditEntry } = require('../miniapp/cloudfunctions/shared/admin-audit')
  const serverDate = Symbol('serverDate')

  assert.deepEqual(buildAdminAuditEntry({
    actorUid: 'uid-owner-1',
    actorName: '老板',
    action: 'catalog.saveProduct',
    module: 'catalog',
    targetType: 'product',
    targetId: 'prod-1',
    summary: '更新商品价格',
    detail: { before: { price: 1990 }, after: { price: 2090 } },
    storeId: 'store-1'
  }, serverDate), {
    actorUid: 'uid-owner-1',
    actorName: '老板',
    action: 'catalog.saveProduct',
    module: 'catalog',
    targetType: 'product',
    targetId: 'prod-1',
    summary: '更新商品价格',
    detail: { before: { price: 1990 }, after: { price: 2090 } },
    storeId: 'store-1',
    createdAt: serverDate
  })
})

test('admin web and admin api expose the owner console skeleton', () => {
  const adminApi = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'index.js')
  const adminWebPackage = path.join(repoRoot, 'admin-web', 'package.json')
  const adminWebMain = path.join(repoRoot, 'admin-web', 'src', 'main.tsx')
  const adminWebApp = path.join(repoRoot, 'admin-web', 'src', 'App.tsx')

  assert.equal(fs.existsSync(adminApi), true)
  assert.equal(fs.existsSync(adminWebPackage), true)
  assert.equal(fs.existsSync(adminWebMain), true)
  assert.equal(fs.existsSync(adminWebApp), true)

  const adminApiSource = fs.readFileSync(adminApi, 'utf8')
  const adminWebPackageSource = fs.readFileSync(adminWebPackage, 'utf8')
  const adminWebMainSource = fs.readFileSync(adminWebMain, 'utf8')
  const adminWebAppSource = fs.readFileSync(adminWebApp, 'utf8')

  assert.match(adminApiSource, /case 'auth\.me'/)
  assert.match(adminApiSource, /case 'dashboard\.getOverview'/)
  assert.match(adminApiSource, /case 'orders\.list'/)
  assert.match(adminApiSource, /case 'catalog\.saveProduct'/)
  assert.match(adminApiSource, /case 'campaigns\.saveFission'/)
  assert.match(adminApiSource, /case 'leads\.list'/)
  assert.match(adminApiSource, /case 'settings\.updateStore'/)
  assert.match(adminApiSource, /case 'settings\.geocodeAddress'/)
  assert.match(adminApiSource, /case 'staff\.listAdminAccounts'/)

  assert.match(adminWebPackageSource, /"antd"/)
  assert.match(adminWebPackageSource, /"@cloudbase\/js-sdk"/)
  assert.match(adminWebPackageSource, /"@tanstack\/react-query"/)
  assert.match(adminWebMainSource, /QueryClientProvider/)
  assert.match(adminWebAppSource, /createBrowserRouter|BrowserRouter/)
})

test('adminApi only imports files packaged inside its own function directory', () => {
  const adminApiRoot = path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi')
  const jsFiles = []

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const nextPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(nextPath)
        continue
      }
      if (entry.isFile() && nextPath.endsWith('.js')) {
        jsFiles.push(nextPath)
      }
    }
  }

  walk(adminApiRoot)

  for (const file of jsFiles) {
    const source = fs.readFileSync(file, 'utf8')
    assert.doesNotMatch(
      source,
      /require\(['"]\.\.\/\.\.\/shared\//,
      `found cross-function shared import in ${path.relative(repoRoot, file)}`
    )
    assert.doesNotMatch(
      source,
      /require\(['"]\.\.\/\.\.\/opsApi\//,
      `found cross-function opsApi import in ${path.relative(repoRoot, file)}`
    )
  }
})

test('admin web treats CloudBase permission-denied responses as expired sessions', async () => {
  const helperModule = await import(pathToFileURL(path.join(repoRoot, 'admin-web', 'src', 'lib', 'auth-errors.js')).href)
  const { isSessionExpiredError } = helperModule

  assert.equal(
    isSessionExpiredError(new Error('{"code":"OPERATION_FAIL","msg":"[PERMISSION_DENIED] Permission denied"}')),
    true
  )
  assert.equal(
    isSessionExpiredError(new Error('未登录或登录状态已失效')),
    true
  )
  assert.equal(
    isSessionExpiredError(new Error('当前账号未开通老板后台权限')),
    false
  )
})

test('admin shell auto-redirects to login when session query returns an expired-session error', () => {
  const adminShellSource = fs.readFileSync(
    path.join(repoRoot, 'admin-web', 'src', 'layouts', 'admin-shell.tsx'),
    'utf8'
  )

  assert.match(adminShellSource, /isSessionExpiredError/)
  assert.match(adminShellSource, /navigate\('\/login',\s*\{\s*replace:\s*true\s*\}\)/)
})

test('admin routes are guarded by a permission-aware wrapper with dotted permissions', () => {
  const appSource = fs.readFileSync(
    path.join(repoRoot, 'admin-web', 'src', 'App.tsx'),
    'utf8'
  )

  assert.match(appSource, /PermissionRoute/)
  assert.match(appSource, /requiredPermission="dashboard\.view"/)
  assert.match(appSource, /requiredPermission="orders\.view"/)
  assert.match(appSource, /requiredPermission="catalog\.manage"/)
  assert.match(appSource, /requiredPermission="campaigns\.manage"/)
  assert.match(appSource, /requiredPermission="crm\.view"/)
  assert.match(appSource, /requiredPermission="settings\.manage"/)
  assert.match(appSource, /requiredPermission="staff\.manage"/)
})

test('admin shell sidebar uses session route permission metadata and dotted permission keys', () => {
  const shellSource = fs.readFileSync(
    path.join(repoRoot, 'admin-web', 'src', 'layouts', 'admin-shell.tsx'),
    'utf8'
  )

  assert.match(shellSource, /routePermissions/)
  assert.match(shellSource, /dashboard\.view/)
  assert.match(shellSource, /orders\.view/)
  assert.match(shellSource, /catalog\.manage/)
  assert.match(shellSource, /campaigns\.manage/)
  assert.match(shellSource, /crm\.view/)
  assert.match(shellSource, /settings\.manage/)
  assert.match(shellSource, /staff\.manage/)
})

test('admin backend requires an explicit bound store and does not fall back to the first store record', () => {
  const contextSource = fs.readFileSync(
    path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'context.js'),
    'utf8'
  )
  const staffSource = fs.readFileSync(
    path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'modules-staff.js'),
    'utf8'
  )
  const dataSource = fs.readFileSync(
    path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'data.js'),
    'utf8'
  )

  assert.doesNotMatch(contextSource, /collection\('stores'\)\.limit\(1\)\.get\(\)/)
  assert.match(contextSource, /未绑定门店|storeId is required/)
  assert.doesNotMatch(staffSource, /\|\|\s*access\.store\._id/)
  assert.doesNotMatch(dataSource, /\|\|\s*access\.store\._id/)
})

test('admin backend session shape exposes route permissions without implicit full-access fallbacks', () => {
  const contextSource = fs.readFileSync(
    path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'context.js'),
    'utf8'
  )
  const authSource = fs.readFileSync(
    path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'modules-auth.js'),
    'utf8'
  )

  assert.doesNotMatch(contextSource, /:\s*ADMIN_WEB_PERMISSIONS/)
  assert.match(contextSource, /normalizeAdminPermissions/)
  assert.match(contextSource, /routePermissions:\s*ADMIN_ROUTE_PERMISSIONS/)
  assert.doesNotMatch(authSource, /permissions:\s*access\.account\.permissions\s*\|\|\s*ADMIN_WEB_PERMISSIONS/)
  assert.match(authSource, /routePermissions:\s*access\.routePermissions/)
})

test('database schema documents admin identity and audit collections', () => {
  const schemaSource = fs.readFileSync(
    path.join(repoRoot, 'docs', 'database_schema.md'),
    'utf8'
  )

  assert.match(schemaSource, /admin_accounts/)
  assert.match(schemaSource, /admin_login_events/)
  assert.match(schemaSource, /admin_audit_logs|audit_logs/)
})

test('phase-b docs describe role templates, admin account lifecycle, and current login telemetry behavior', () => {
  const schemaSource = fs.readFileSync(
    path.join(repoRoot, 'docs', 'database_schema.md'),
    'utf8'
  )
  const deploySource = fs.readFileSync(
    path.join(repoRoot, 'docs', 'admin-web-deploy.md'),
    'utf8'
  )

  assert.match(schemaSource, /admin_role_templates/)
  assert.match(schemaSource, /isSystem/)
  assert.match(schemaSource, /pending_activation/)
  assert.match(schemaSource, /active/)
  assert.match(schemaSource, /disabled/)
  assert.match(schemaSource, /storeId/)
  assert.match(schemaSource, /admin_login_events/)
  assert.match(schemaSource, /lastLoginAt/)
  assert.match(schemaSource, /当前实现.*(?:仅|只).*(?:更新|回写).*lastLoginAt/s)

  assert.match(deploySource, /角色模板/)
  assert.match(deploySource, /后台账号/)
  assert.match(deploySource, /登录 UID/)
  assert.match(deploySource, /待激活/)
  assert.match(deploySource, /不提供密码重置/)
  assert.match(deploySource, /不提供.*(?:CloudBase 用户开通|用户创建|用户 provisioning)/)
})

test('admin web ships an env example with placeholder CloudBase web credentials', () => {
  const envExamplePath = path.join(repoRoot, 'admin-web', '.env.example')

  assert.equal(fs.existsSync(envExamplePath), true)

  const envExampleSource = fs.readFileSync(envExamplePath, 'utf8')
  assert.match(envExampleSource, /^VITE_CLOUDBASE_ENV=your-env-id$/m)
  assert.match(envExampleSource, /^VITE_CLOUDBASE_REGION=ap-shanghai$/m)
  assert.match(envExampleSource, /^VITE_CLOUDBASE_PUBLISHABLE_KEY=your-publishable-key$/m)
})

test('admin identity API exposes role template and admin account lifecycle methods', () => {
  const apiSource = fs.readFileSync(
    path.join(repoRoot, 'admin-web', 'src', 'lib', 'admin-api.ts'),
    'utf8'
  )
  const typeSource = fs.readFileSync(
    path.join(repoRoot, 'admin-web', 'src', 'types', 'admin.ts'),
    'utf8'
  )

  assert.match(apiSource, /listRoleTemplates/)
  assert.match(apiSource, /createAdminAccount/)
  assert.match(apiSource, /updateAdminAccountStatus/)
  assert.match(apiSource, /updateAdminAccountPermissions/)
  assert.match(apiSource, /listAdminLoginEvents/)
  assert.match(typeSource, /export interface AdminRoleTemplate/)
  assert.match(typeSource, /export interface AdminAccountForm/)
  assert.match(typeSource, /export interface AdminLoginEvent/)
})

test('admin staff module exposes role templates, admin account creation, status updates, and login-event listing', () => {
  const apiSource = fs.readFileSync(
    path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'index.js'),
    'utf8'
  )
  const staffSource = fs.readFileSync(
    path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'modules-staff.js'),
    'utf8'
  )

  assert.match(apiSource, /case 'staff\.listRoleTemplates'/)
  assert.match(apiSource, /case 'staff\.createAdminAccount'/)
  assert.match(apiSource, /case 'staff\.updateAdminAccountStatus'/)
  assert.match(apiSource, /case 'staff\.updateAdminAccountPermissions'/)
  assert.match(apiSource, /case 'staff\.listAdminLoginEvents'/)
  assert.match(staffSource, /async function listRoleTemplates/)
  assert.match(staffSource, /async function createAdminAccount/)
  assert.match(staffSource, /async function updateAdminAccountStatus/)
  assert.match(staffSource, /async function updateAdminAccountPermissions/)
  assert.match(staffSource, /async function listAdminLoginEvents/)
})

test('staff page exposes admin-account creation, status controls, role templates, and login-event views', () => {
  const staffPageSource = fs.readFileSync(
    path.join(repoRoot, 'admin-web', 'src', 'pages', 'staff-page.tsx'),
    'utf8'
  )

  assert.match(staffPageSource, /后台账号管理/)
  assert.match(staffPageSource, /创建后台账号/)
  assert.match(staffPageSource, /角色模板/)
  assert.match(staffPageSource, /登录日志/)
  assert.match(staffPageSource, /小程序员工权限/)
  assert.match(staffPageSource, /最近审计日志/)
  assert.match(staffPageSource, /createAdminAccount/)
  assert.match(staffPageSource, /updateAdminAccountStatus/)
  assert.match(staffPageSource, /updateAdminAccountPermissions/)
  assert.match(staffPageSource, /listRoleTemplates/)
  assert.match(staffPageSource, /listAdminLoginEvents/)
})

test('admin refund implementation uses shared refunding transition before finalize', () => {
  const refundSource = fs.readFileSync(
    path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'refund.js'),
    'utf8'
  )

  assert.match(refundSource, /planEnterRefunding/)
  assert.match(refundSource, /planFinalizeRefund/)
  assert.match(refundSource, /enterPlan\.requestUpdate|enterPlan\.orderUpdate/)
  assert.match(refundSource, /finalizePlan\.requestUpdate|finalizePlan\.orderUpdate/)
})

test('admin api exposes verification query, queue, records, and verify actions', () => {
  const apiSource = fs.readFileSync(
    path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'index.js'),
    'utf8'
  )
  const ordersSource = fs.readFileSync(
    path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'modules-orders.js'),
    'utf8'
  )

  assert.match(apiSource, /case 'orders\.queryVerifyCode'/)
  assert.match(apiSource, /case 'orders\.listPendingVerification'/)
  assert.match(apiSource, /case 'orders\.listVerificationRecords'/)
  assert.match(apiSource, /case 'orders\.verifyOrderItem'/)
  assert.match(ordersSource, /async function queryVerifyCode/)
  assert.match(ordersSource, /async function listPendingVerification/)
  assert.match(ordersSource, /async function listVerificationRecords/)
  assert.match(ordersSource, /async function verifyOrderItem/)
})

test('admin web api exposes verification workspace methods and payload types', () => {
  const apiSource = fs.readFileSync(
    path.join(repoRoot, 'admin-web', 'src', 'lib', 'admin-api.ts'),
    'utf8'
  )
  const typeSource = fs.readFileSync(
    path.join(repoRoot, 'admin-web', 'src', 'types', 'admin.ts'),
    'utf8'
  )

  assert.match(apiSource, /queryVerifyCode/)
  assert.match(apiSource, /listPendingVerification/)
  assert.match(apiSource, /listVerificationRecords/)
  assert.match(apiSource, /verifyOrderItem/)
  assert.match(typeSource, /export interface VerificationLookup/)
  assert.match(typeSource, /export interface VerificationQueueItem/)
  assert.match(typeSource, /export interface VerificationRecord/)
  assert.match(typeSource, /export interface VerificationUsageRecord/)
})

test('admin web exposes a dedicated verification page and dashboard entry', () => {
  const appSource = fs.readFileSync(
    path.join(repoRoot, 'admin-web', 'src', 'App.tsx'),
    'utf8'
  )
  const shellSource = fs.readFileSync(
    path.join(repoRoot, 'admin-web', 'src', 'layouts', 'admin-shell.tsx'),
    'utf8'
  )
  const dashboardSource = fs.readFileSync(
    path.join(repoRoot, 'admin-web', 'src', 'pages', 'dashboard-page.tsx'),
    'utf8'
  )

  assert.match(appSource, /verification/)
  assert.match(shellSource, /核销台/)
  assert.match(dashboardSource, /待核销服务/)
  assert.match(dashboardSource, /navigate\('\/verification'/)
})

test('verification page exposes pending queue and fulfillment record workspace sections', () => {
  const verificationPageSource = fs.readFileSync(
    path.join(repoRoot, 'admin-web', 'src', 'pages', 'verification-page.tsx'),
    'utf8'
  )

  assert.match(verificationPageSource, /待核销服务/)
  assert.match(verificationPageSource, /最近履约记录/)
  assert.match(verificationPageSource, /核销码直查/)
  assert.match(verificationPageSource, /listPendingVerification/)
  assert.match(verificationPageSource, /listVerificationRecords/)
  assert.match(verificationPageSource, /使用该核销码/)
  assert.match(verificationPageSource, /queryCardRef/)
})

test('verification contracts expose richer filters and pagination for queue and records', () => {
  const ordersSource = fs.readFileSync(
    path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'modules-orders.js'),
    'utf8'
  )
  const typeSource = fs.readFileSync(
    path.join(repoRoot, 'admin-web', 'src', 'types', 'admin.ts'),
    'utf8'
  )

  assert.match(typeSource, /export interface VerificationQueueFilters/)
  assert.match(typeSource, /page\?: number/)
  assert.match(typeSource, /pageSize\?: number/)
  assert.match(typeSource, /dateRange\?: string\[]/)
  assert.match(typeSource, /export interface VerificationRecordFilters/)
  assert.match(typeSource, /serviceName\?: string/)
  assert.match(typeSource, /operatorOpenid\?: string/)
  assert.match(typeSource, /verifyCode\?: string/)

  assert.match(ordersSource, /async function listPendingVerification/)
  assert.match(ordersSource, /dateRange = \[\]/)
  assert.match(ordersSource, /paginate\(rows,\s*Number\(page \|\| 1\),\s*Number\(pageSize \|\| 20\)\)/)
  assert.match(ordersSource, /async function listVerificationRecords/)
  assert.match(ordersSource, /serviceName = ''/)
  assert.match(ordersSource, /operatorOpenid = ''/)
  assert.match(ordersSource, /verifyCode = ''/)
  assert.match(ordersSource, /dateRange = \[\]/)
})

test('refund review rejection path stays aligned with refund state-machine vocabulary', () => {
  const ordersSource = fs.readFileSync(
    path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'modules-orders.js'),
    'utf8'
  )

  assert.match(ordersSource, /const fallbackOrderStatus = request\.previousStatus \|\| 'paid'/)
  assert.match(ordersSource, /status:\s*'rejected'/)
  assert.match(ordersSource, /status:\s*fallbackOrderStatus/)
})

test('order detail types include fulfillment and verification item fields', () => {
  const typeSource = fs.readFileSync(
    path.join(repoRoot, 'admin-web', 'src', 'types', 'admin.ts'),
    'utf8'
  )

  assert.match(typeSource, /export interface OrderItemDetail/)
  assert.match(typeSource, /verifyCode\??:\s*string/)
  assert.match(typeSource, /packageRemaining\??:\s*Record<string,\s*unknown>\s*\|\s*null/)
  assert.match(typeSource, /packageExpireAt\??:\s*unknown/)
  assert.match(typeSource, /verificationStatus\??:\s*string/)
})

test('admin order detail payload maps fulfillment and verification fields', () => {
  const ordersSource = fs.readFileSync(
    path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'modules-orders.js'),
    'utf8'
  )

  assert.match(ordersSource, /verifyCode:\s*item\.verifyCode/)
  assert.match(ordersSource, /packageRemaining:\s*item\.packageRemaining/)
  assert.match(ordersSource, /packageExpireAt:\s*item\.packageExpireAt/)
  assert.match(ordersSource, /verificationStatus:/)
})

test('orders page displays fulfillment and verification details in the order drawer', () => {
  const ordersPageSource = fs.readFileSync(
    path.join(repoRoot, 'admin-web', 'src', 'pages', 'orders-page.tsx'),
    'utf8'
  )

  assert.match(ordersPageSource, /核销码/)
  assert.match(ordersPageSource, /剩余次数/)
  assert.match(ordersPageSource, /有效期/)
  assert.match(ordersPageSource, /核销状态|使用状态/)
  assert.match(ordersPageSource, /退款时间线/)
})

test('orders detail drawer exposes a fulfillment-history card', () => {
  const ordersPageSource = fs.readFileSync(
    path.join(repoRoot, 'admin-web', 'src', 'pages', 'orders-page.tsx'),
    'utf8'
  )

  assert.match(ordersPageSource, /verificationRecords/)
  assert.match(ordersPageSource, /title="履约记录"/)
  assert.match(ordersPageSource, /核销时间/)
  assert.match(ordersPageSource, /服务项目/)
  assert.match(ordersPageSource, /核销码/)
  assert.match(ordersPageSource, /操作人/)
  assert.match(ordersPageSource, /当前状态/)
})

test('database schema documents shared refund vocabulary and pending to refunding to refunded flow', () => {
  const schemaSource = fs.readFileSync(
    path.join(repoRoot, 'docs', 'database_schema.md'),
    'utf8'
  )

  assert.match(schemaSource, /refund_requests/)
  assert.match(schemaSource, /refund_requested/)
  assert.match(schemaSource, /refunding/)
  assert.match(schemaSource, /pending\s*->\s*refunding\s*->\s*refunded/)
  assert.match(schemaSource, /驳回.*回退.*(?:previousStatus|原可支付订单状态|paid|shipped|completed)/s)
})

test('docs describe the web verification console route, direct-lookup scope, and package usage linkage', () => {
  const schemaSource = fs.readFileSync(
    path.join(repoRoot, 'docs', 'database_schema.md'),
    'utf8'
  )
  const deploySource = fs.readFileSync(
    path.join(repoRoot, 'docs', 'admin-web-deploy.md'),
    'utf8'
  )

  assert.match(schemaSource, /order_items/)
  assert.match(schemaSource, /verifyCode/)
  assert.match(schemaSource, /packageRemaining/)
  assert.match(schemaSource, /package_usage/)
  assert.match(schemaSource, /orderItemId/)
  assert.match(schemaSource, /核销.*order_items.*package_usage|order_items.*核销.*package_usage/s)

  assert.match(deploySource, /\/verification/)
  assert.match(deploySource, /核销台/)
  assert.match(deploySource, /待核销服务/)
  assert.match(deploySource, /最近履约记录|履约记录/)
  assert.match(deploySource, /直查|直接查码|direct lookup/)
  assert.match(deploySource, /不是完整的履约报表中心|not a full fulfillment report center/)
})

test('docs describe verification pagination filters and order-detail fulfillment history linkage', () => {
  const schemaSource = fs.readFileSync(
    path.join(repoRoot, 'docs', 'database_schema.md'),
    'utf8'
  )
  const deploySource = fs.readFileSync(
    path.join(repoRoot, 'docs', 'admin-web-deploy.md'),
    'utf8'
  )

  assert.match(schemaSource, /分页/)
  assert.match(schemaSource, /dateRange|日期范围/)
  assert.match(schemaSource, /serviceName|服务项目/)
  assert.match(schemaSource, /operatorOpenid|操作人/)
  assert.match(schemaSource, /订单详情.*履约记录|履约记录.*订单详情/s)

  assert.match(deploySource, /分页/)
  assert.match(deploySource, /日期筛选|日期范围/)
  assert.match(deploySource, /服务项目/)
  assert.match(deploySource, /操作人/)
  assert.match(deploySource, /订单详情/)
  assert.match(deploySource, /履约记录/)
})

test('admin web deploy docs describe the refund lifecycle and current phase-c verification scope', () => {
  const deploySource = fs.readFileSync(
    path.join(repoRoot, 'docs', 'admin-web-deploy.md'),
    'utf8'
  )

  assert.match(deploySource, /refund_requested/)
  assert.match(deploySource, /refunding|退款中|退款处理中/)
  assert.match(deploySource, /pending\s*->\s*refunding\s*->\s*refunded/)
  assert.match(deploySource, /驳回.*回退.*(?:previousStatus|原可支付订单状态|paid|shipped|completed)/s)
  assert.match(deploySource, /\/verification/)
  assert.match(deploySource, /核销台/)
  assert.match(deploySource, /不是完整的履约报表中心|not a full fulfillment report center/)
})


test('phase-d admin api exposes finance, customer, catalog, campaigns, and ops actions', () => {
  const apiSource = fs.readFileSync(
    path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'index.js'),
    'utf8'
  )

  assert.match(apiSource, /case 'finance\.listPaymentRecords'/)
  assert.match(apiSource, /case 'finance\.listRefundRecords'/)
  assert.match(apiSource, /case 'finance\.getReconciliationSummary'/)
  assert.match(apiSource, /case 'leads\.listCustomers'/)
  assert.match(apiSource, /case 'leads\.getCustomerDetail'/)
  assert.match(apiSource, /case 'leads\.listFollowupEvents'/)
  assert.match(apiSource, /case 'catalog\.getProductDetail'/)
  assert.match(apiSource, /case 'campaigns\.getFissionDetail'/)
  assert.match(apiSource, /case 'campaigns\.listFissionRecords'/)
  assert.match(apiSource, /case 'settings\.updateNotificationConfig'/)
  assert.match(apiSource, /case 'settings\.getSystemHealth'/)
})

test('admin web api and types expose phase-d finance and customer contracts', () => {
  const apiSource = fs.readFileSync(
    path.join(repoRoot, 'admin-web', 'src', 'lib', 'admin-api.ts'),
    'utf8'
  )
  const typeSource = fs.readFileSync(
    path.join(repoRoot, 'admin-web', 'src', 'types', 'admin.ts'),
    'utf8'
  )

  assert.match(apiSource, /listPaymentRecords/)
  assert.match(apiSource, /listRefundRecords/)
  assert.match(apiSource, /getReconciliationSummary/)
  assert.match(apiSource, /listCustomers/)
  assert.match(apiSource, /getCustomerDetail/)
  assert.match(apiSource, /listFollowupEvents/)
  assert.match(apiSource, /getProductDetail/)
  assert.match(apiSource, /getFissionDetail/)
  assert.match(apiSource, /listFissionRecords/)
  assert.match(apiSource, /updateNotificationConfig/)
  assert.match(apiSource, /getSystemHealth/)

  assert.match(typeSource, /export interface PaymentRecord/)
  assert.match(typeSource, /export interface RefundRecord/)
  assert.match(typeSource, /export interface ReconciliationSummary/)
  assert.match(typeSource, /export interface CustomerRecord/)
  assert.match(typeSource, /export interface CustomerDetail/)
  assert.match(typeSource, /export interface FollowupEvent/)
  assert.match(typeSource, /export interface ProductDetail/)
  assert.match(typeSource, /export interface CampaignDetail/)
  assert.match(typeSource, /export interface FissionRecord/)
  assert.match(typeSource, /export interface NotificationConfig/)
  assert.match(typeSource, /export interface SystemHealth/)
})

test('admin web exposes finance, customers, and ops pages with route guards', () => {
  const appSource = fs.readFileSync(
    path.join(repoRoot, 'admin-web', 'src', 'App.tsx'),
    'utf8'
  )
  const shellSource = fs.readFileSync(
    path.join(repoRoot, 'admin-web', 'src', 'layouts', 'admin-shell.tsx'),
    'utf8'
  )

  assert.match(appSource, /path: 'finance'/)
  assert.match(appSource, /path: 'customers'/)
  assert.match(appSource, /path: 'ops'/)
  assert.match(appSource, /FinancePage/)
  assert.match(appSource, /CustomersPage/)
  assert.match(appSource, /OpsPage/)

  assert.match(shellSource, /财务中心/)
  assert.match(shellSource, /客户运营/)
  assert.match(shellSource, /审计运维/)
})

test('finance page renders payment records, refund records, and reconciliation summary', () => {
  const financeSource = fs.readFileSync(
    path.join(repoRoot, 'admin-web', 'src', 'pages', 'finance-page.tsx'),
    'utf8'
  )

  assert.match(financeSource, /财务与对账中心/)
  assert.match(financeSource, /对账概览/)
  assert.match(financeSource, /支付流水/)
  assert.match(financeSource, /退款流水/)
  assert.match(financeSource, /listPaymentRecords/)
  assert.match(financeSource, /listRefundRecords/)
  assert.match(financeSource, /getReconciliationSummary/)
})

test('customers page renders customer list and detail drawer with followup timeline', () => {
  const customersSource = fs.readFileSync(
    path.join(repoRoot, 'admin-web', 'src', 'pages', 'customers-page.tsx'),
    'utf8'
  )

  assert.match(customersSource, /客户与运营中心/)
  assert.match(customersSource, /listCustomers/)
  assert.match(customersSource, /getCustomerDetail/)
  assert.match(customersSource, /最近订单/)
  assert.match(customersSource, /跟进时间轴/)
})

test('ops page renders system health and audit logs', () => {
  const opsSource = fs.readFileSync(
    path.join(repoRoot, 'admin-web', 'src', 'pages', 'ops-page.tsx'),
    'utf8'
  )

  assert.match(opsSource, /系统配置与运维中心/)
  assert.match(opsSource, /系统健康/)
  assert.match(opsSource, /审计日志/)
  assert.match(opsSource, /getSystemHealth/)
})

test('settings page includes notification config card', () => {
  const settingsSource = fs.readFileSync(
    path.join(repoRoot, 'admin-web', 'src', 'pages', 'settings-page.tsx'),
    'utf8'
  )

  assert.match(settingsSource, /通知配置/)
  assert.match(settingsSource, /updateNotificationConfig/)
  assert.match(settingsSource, /orderNotifyEnabled/)
  assert.match(settingsSource, /refundNotifyEnabled/)
  assert.match(settingsSource, /一键解析地址/)
  assert.match(settingsSource, /地图选点/)
  assert.match(settingsSource, /门店地图位置/)
  assert.match(settingsSource, /openstreetmap/)
  assert.match(settingsSource, /上传 Logo/)
  assert.match(settingsSource, /uploadFileToCloud/)
})

test('phase-d docs describe new collections and page routes', () => {
  const schemaSource = fs.readFileSync(
    path.join(repoRoot, 'docs', 'database_schema.md'),
    'utf8'
  )
  const deploySource = fs.readFileSync(
    path.join(repoRoot, 'docs', 'admin-web-deploy.md'),
    'utf8'
  )

  assert.match(schemaSource, /notification_settings/)
  assert.match(deploySource, /\/finance/)
  assert.match(deploySource, /\/customers/)
  assert.match(deploySource, /\/ops/)
})
