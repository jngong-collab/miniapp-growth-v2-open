# Admin Foundation Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the shared admin foundation so later domain work can proceed safely: one permission vocabulary, strict backend auth/store scoping, route-level frontend authorization, and regression coverage/documentation for the new contract.

**Architecture:** Freeze shared contracts first, then tighten backend authorization, then wire frontend route guards against the same permission metadata. Keep Phase A focused on controller-owned shared files only; do not add finance/catalog/CRM features yet.

**Tech Stack:** React, TypeScript, React Router, TanStack Query, Ant Design, CloudBase Web SDK, wx-server-sdk cloud functions, node:test

---

### Task 1: Freeze Shared Permission And Session Contracts

**Files:**
- Create: `miniapp/cloudfunctions/adminApi/lib/admin-contract.js`
- Modify: `miniapp/cloudfunctions/adminApi/lib/admin-access.js`
- Modify: `admin-web/src/types/admin.ts`
- Modify: `admin-web/src/lib/admin-api.ts`
- Test: `tests/admin-web.test.js`

- [ ] **Step 1: Write the failing contract test**

```js
test('admin contract exposes deny-by-default permissions and route metadata fields', () => {
  const { ADMIN_PERMISSION_KEYS, ADMIN_ROUTE_PERMISSIONS } = require('../miniapp/cloudfunctions/adminApi/lib/admin-contract')

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
  assert.equal(ADMIN_ROUTE_PERMISSIONS['/staff'], 'staff.manage')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test tests/admin-web.test.js
```

Expected: FAIL with module-not-found or missing permission vocabulary assertions for `admin-contract`.

- [ ] **Step 3: Add the shared contract module and rewire backend/frontend types**

```js
// miniapp/cloudfunctions/adminApi/lib/admin-contract.js
const ADMIN_PERMISSION_KEYS = [
  'dashboard.view',
  'orders.view',
  'orders.refund.review',
  'catalog.manage',
  'campaigns.manage',
  'crm.view',
  'settings.manage',
  'staff.manage',
  'audit.view'
]

const ADMIN_ROUTE_PERMISSIONS = {
  '/dashboard': 'dashboard.view',
  '/orders': 'orders.view',
  '/catalog': 'catalog.manage',
  '/campaigns': 'campaigns.manage',
  '/leads': 'crm.view',
  '/settings': 'settings.manage',
  '/staff': 'staff.manage'
}

module.exports = {
  ADMIN_PERMISSION_KEYS,
  ADMIN_ROUTE_PERMISSIONS
}
```

```js
// miniapp/cloudfunctions/adminApi/lib/admin-access.js
const { ADMIN_PERMISSION_KEYS } = require('./admin-contract')

function normalizeAdminPermissions(permissions) {
  if (!Array.isArray(permissions)) return []
  return Array.from(new Set(permissions.filter(permission => ADMIN_PERMISSION_KEYS.includes(permission))))
}
```

```ts
// admin-web/src/types/admin.ts
export type PermissionKey =
  | 'dashboard.view'
  | 'orders.view'
  | 'orders.refund.review'
  | 'catalog.manage'
  | 'campaigns.manage'
  | 'crm.view'
  | 'settings.manage'
  | 'staff.manage'
  | 'audit.view'

export interface AdminSession {
  uid: string
  username: string
  displayName: string
  role: string
  status: string
  permissions: PermissionKey[]
  storeId: string
  storeName: string
  storeInfo: Record<string, unknown> | null
  routePermissions: Record<string, PermissionKey>
}
```

- [ ] **Step 4: Run the test to verify the contract passes**

Run:

```powershell
node --test tests/admin-web.test.js
```

Expected: PASS for the new contract test; other tests may still fail until Tasks 2-4 are complete.

- [ ] **Step 5: Commit**

```bash
git add miniapp/cloudfunctions/adminApi/lib/admin-contract.js miniapp/cloudfunctions/adminApi/lib/admin-access.js admin-web/src/types/admin.ts admin-web/src/lib/admin-api.ts tests/admin-web.test.js
git commit -m "feat: freeze admin permission contract"
```

### Task 2: Enforce Strict Backend Auth, Store Scope, And Session Shape

**Files:**
- Modify: `miniapp/cloudfunctions/adminApi/lib/context.js`
- Modify: `miniapp/cloudfunctions/adminApi/lib/modules-auth.js`
- Modify: `miniapp/cloudfunctions/adminApi/lib/modules-staff.js`
- Modify: `miniapp/cloudfunctions/adminApi/lib/data.js`
- Test: `tests/admin-web.test.js`

- [ ] **Step 1: Write the failing backend behavior tests**

```js
test('admin access does not escalate empty permissions to full access', () => {
  const { normalizeAdminPermissions } = require('../miniapp/cloudfunctions/adminApi/lib/admin-access')
  assert.deepEqual(normalizeAdminPermissions(undefined), [])
  assert.deepEqual(normalizeAdminPermissions([]), [])
})

test('admin me contract includes route permissions and never falls back to first store', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'context.js'), 'utf8')
  assert.doesNotMatch(source, /limit\(1\)\.get\(\)/)
  assert.match(source, /storeId is required|账号未绑定门店/)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test tests/admin-web.test.js
```

Expected: FAIL because `context.js` still falls back to the first store and permissions still default to full access.

- [ ] **Step 3: Tighten backend access control and `auth.me`**

```js
// miniapp/cloudfunctions/adminApi/lib/context.js
const { ADMIN_ROUTE_PERMISSIONS } = require('./admin-contract')

async function requireAdminAccess(permission = '') {
  const uid = getCurrentUid()
  if (!uid) {
    return { code: 401, msg: '未登录或登录状态已失效' }
  }

  const accountRes = await db.collection('admin_accounts').where({ uid }).limit(1).get().catch(() => ({ data: [] }))
  const account = accountRes.data[0] || null
  if (!account) {
    return { code: 403, msg: '当前账号未开通后台权限' }
  }
  if ((account.status || 'active') !== 'active') {
    return { code: 403, msg: '后台账号已停用' }
  }
  if (!account.storeId) {
    return { code: 403, msg: '后台账号未绑定门店' }
  }

  const store = await db.collection('stores').doc(account.storeId).get().then(res => res.data).catch(() => null)
  if (!store) {
    return { code: 403, msg: '门店信息不存在' }
  }

  const permissions = normalizeAdminPermissions(account.permissions)
  if (permission && !canManagePermission(permissions, permission)) {
    return { code: 403, msg: '无访问权限' }
  }

  return {
    code: 0,
    uid,
    permissions,
    routePermissions: ADMIN_ROUTE_PERMISSIONS,
    account: { ...account, permissions },
    store
  }
}
```

```js
// miniapp/cloudfunctions/adminApi/lib/modules-auth.js
async function getAdminMe() {
  const ctx = await requireAdminAccess()
  if (ctx.code !== 0) return ctx

  await db.collection('admin_accounts').doc(ctx.account._id).update({
    data: {
      lastLoginAt: new Date(),
      updatedAt: new Date()
    }
  }).catch(() => null)

  return {
    code: 0,
    data: {
      uid: ctx.uid,
      username: ctx.account.username,
      displayName: ctx.account.displayName,
      role: ctx.account.role,
      status: ctx.account.status,
      permissions: ctx.permissions,
      routePermissions: ctx.routePermissions,
      storeId: ctx.account.storeId,
      storeName: ctx.store.name || '',
      storeInfo: ctx.store
    }
  }
}
```

- [ ] **Step 4: Run the tests to verify backend auth behavior passes**

Run:

```powershell
node --test tests/admin-web.test.js
```

Expected: PASS for permission/store-scope tests. Existing UI route tests may still fail until Task 3.

- [ ] **Step 5: Commit**

```bash
git add miniapp/cloudfunctions/adminApi/lib/context.js miniapp/cloudfunctions/adminApi/lib/modules-auth.js miniapp/cloudfunctions/adminApi/lib/modules-staff.js miniapp/cloudfunctions/adminApi/lib/data.js tests/admin-web.test.js
git commit -m "feat: enforce strict admin access rules"
```

### Task 3: Add Frontend Route Guards And Permission-Aware Navigation

**Files:**
- Create: `admin-web/src/components/permission-route.tsx`
- Modify: `admin-web/src/App.tsx`
- Modify: `admin-web/src/layouts/admin-shell.tsx`
- Modify: `admin-web/src/pages/login-page.tsx`
- Test: `tests/admin-web.test.js`

- [ ] **Step 1: Write the failing route-guard tests**

```js
test('admin routes are guarded by a permission-aware wrapper', () => {
  const appSource = fs.readFileSync(path.join(repoRoot, 'admin-web', 'src', 'App.tsx'), 'utf8')
  assert.match(appSource, /PermissionRoute/)
  assert.match(appSource, /requiredPermission="dashboard\.view"/)
  assert.match(appSource, /requiredPermission="staff\.manage"/)
})

test('admin shell sidebar uses route permission metadata from the session contract', () => {
  const shellSource = fs.readFileSync(path.join(repoRoot, 'admin-web', 'src', 'layouts', 'admin-shell.tsx'), 'utf8')
  assert.match(shellSource, /routePermissions/)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test tests/admin-web.test.js
```

Expected: FAIL because routes are mounted directly and shell filtering is hard-coded.

- [ ] **Step 3: Implement route guards and shared menu gating**

```tsx
// admin-web/src/components/permission-route.tsx
import { Result } from 'antd'
import { useOutletContext } from 'react-router-dom'
import type { AdminSession, PermissionKey } from '../types/admin'

export function PermissionRoute({ requiredPermission, children }: { requiredPermission: PermissionKey; children: JSX.Element }) {
  const { session } = useOutletContext<{ session: AdminSession }>()
  if (!session.permissions.includes(requiredPermission)) {
    return <Result status="403" title="无访问权限" subTitle="当前账号无权访问该页面" />
  }
  return children
}
```

```tsx
// admin-web/src/App.tsx
{ path: 'dashboard', element: <PermissionRoute requiredPermission="dashboard.view"><DashboardPage /></PermissionRoute> }
{ path: 'orders', element: <PermissionRoute requiredPermission="orders.view"><OrdersPage /></PermissionRoute> }
{ path: 'staff', element: <PermissionRoute requiredPermission="staff.manage"><StaffPage /></PermissionRoute> }
```

```tsx
// admin-web/src/layouts/admin-shell.tsx
const menuItems = [
  { key: '/dashboard', label: '经营看板', permission: 'dashboard.view' as PermissionKey },
  { key: '/orders', label: '订单退款', permission: 'orders.view' as PermissionKey }
]
```

- [ ] **Step 4: Run the tests and build to verify the frontend passes**

Run:

```powershell
node --test tests/admin-web.test.js
npm run build
```

Working directory for build:

```powershell
C:\Users\Administrator\Desktop\裂变小程序\admin-web
```

Expected: tests PASS and Vite build succeeds.

- [ ] **Step 5: Commit**

```bash
git add admin-web/src/components/permission-route.tsx admin-web/src/App.tsx admin-web/src/layouts/admin-shell.tsx admin-web/src/pages/login-page.tsx tests/admin-web.test.js
git commit -m "feat: guard admin routes by permission"
```

### Task 4: Document The Phase-A Contract And Lock Regression Coverage

**Files:**
- Modify: `docs/database_schema.md`
- Modify: `docs/admin-web-deploy.md`
- Create: `admin-web/.env.example`
- Modify: `tests/admin-web.test.js`
- Test: `tests/admin-web.test.js`

- [ ] **Step 1: Write the failing documentation/fixture tests**

```js
test('database schema documents admin identity and audit collections', () => {
  const schemaSource = fs.readFileSync(path.join(repoRoot, 'docs', 'database_schema.md'), 'utf8')
  assert.match(schemaSource, /admin_accounts/)
  assert.match(schemaSource, /admin_login_events/)
  assert.match(schemaSource, /admin_audit_logs|audit_logs/)
})

test('admin web ships an env example instead of relying on committed production secrets', () => {
  assert.equal(fs.existsSync(path.join(repoRoot, 'admin-web', '.env.example')), true)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test tests/admin-web.test.js
```

Expected: FAIL because schema docs are incomplete and `.env.example` does not exist yet.

- [ ] **Step 3: Update docs and example environment file**

```md
## admin_accounts
- uid
- username
- displayName
- role
- permissions
- storeId
- status
- lastLoginAt

## admin_login_events
- uid
- username
- storeId
- eventType
- result
- ip
- createdAt

## admin_audit_logs
- actorUid
- actorName
- module
- action
- targetType
- targetId
- detail
- storeId
- createdAt
```

```env
# admin-web/.env.example
VITE_TCB_ENV_ID=your-env-id
VITE_TCB_REGION=ap-shanghai
VITE_TCB_CLIENT_ID=your-publishable-key
```

- [ ] **Step 4: Run the full Phase-A regression check**

Run:

```powershell
node --test tests/admin-web.test.js
```

Expected: PASS for all Phase-A contract, route, and documentation assertions.

- [ ] **Step 5: Commit**

```bash
git add docs/database_schema.md docs/admin-web-deploy.md admin-web/.env.example tests/admin-web.test.js
git commit -m "docs: record admin foundation contract"
```

## Self-Review

- Spec coverage: this plan covers the shared foundation from the master spec only. Identity lifecycle UI, finance screens, asset management, CRM expansion, and ops tooling remain for later phase plans.
- Placeholder scan: no `TBD`/`TODO` tasks remain; all steps have concrete files and commands.
- Type consistency: the permission vocabulary and `routePermissions` field are introduced in Task 1 and consumed consistently in Tasks 2 and 3.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-15-admin-foundation-phase-a.md`.

The user already requested parallel subagent execution, so execute this plan using `superpowers:subagent-driven-development` with Task 1 first, then Task 2, then Task 3, then Task 4. Do not start domain-specific features until all four shared-foundation tasks are green.
