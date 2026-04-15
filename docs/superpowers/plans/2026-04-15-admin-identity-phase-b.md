# Admin Identity Phase B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current read-only admin account area into a real identity and permissions center: admin account lifecycle, role templates, web staff permission assignment, and login-log visibility.

**Architecture:** Keep the Phase-A permission contract as the shared foundation. Build Phase B on top of `modules-staff.js` and `staff-page.tsx`, adding explicit lifecycle endpoints, role-template records, and web-only account actions while preserving store isolation and audit logging.

**Tech Stack:** React, TypeScript, Ant Design, TanStack Query, CloudBase Web SDK, wx-server-sdk cloud functions, node:test

---

### Task 1: Extend Shared Staff/Admin Types And API Surface

**Files:**
- Modify: `admin-web/src/types/admin.ts`
- Modify: `admin-web/src/lib/admin-api.ts`
- Test: `tests/admin-web.test.js`

- [ ] **Step 1: Write the failing API contract test**

```js
test('admin identity API exposes role template and admin account lifecycle methods', () => {
  const apiSource = fs.readFileSync(path.join(repoRoot, 'admin-web', 'src', 'lib', 'admin-api.ts'), 'utf8')
  const typeSource = fs.readFileSync(path.join(repoRoot, 'admin-web', 'src', 'types', 'admin.ts'), 'utf8')

  assert.match(apiSource, /listRoleTemplates/)
  assert.match(apiSource, /createAdminAccount/)
  assert.match(apiSource, /updateAdminAccountStatus/)
  assert.match(apiSource, /updateAdminAccountPermissions/)
  assert.match(typeSource, /export interface AdminRoleTemplate/)
  assert.match(typeSource, /export interface AdminAccountForm/)
  assert.match(typeSource, /loginEvents/i)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test tests/admin-web.test.js
```

Expected: FAIL because the lifecycle methods and new types do not exist yet.

- [ ] **Step 3: Add the Phase-B admin identity DTOs and RPC methods**

```ts
// admin-web/src/types/admin.ts
export interface AdminRoleTemplate {
  _id?: string
  roleKey: string
  roleName: string
  permissions: PermissionKey[]
  isSystem?: boolean
  status?: string
}

export interface AdminAccountForm {
  username: string
  displayName: string
  role: string
  permissions: PermissionKey[]
  storeId: string
  status?: string
}

export interface AdminLoginEvent {
  _id?: string
  uid: string
  username: string
  eventType: string
  result: string
  ip?: string
  createdAt: unknown
}
```

```ts
// admin-web/src/lib/admin-api.ts
listRoleTemplates: () => callAdminApi<AdminRoleTemplate[]>('staff.listRoleTemplates'),
createAdminAccount: (payload: Record<string, unknown>) => callAdminApi<AdminAccount>('staff.createAdminAccount', { payload }),
updateAdminAccountStatus: (uid: string, status: string) => callAdminApi<AdminAccount>('staff.updateAdminAccountStatus', { uid, status }),
updateAdminAccountPermissions: (uid: string, permissions: string[], role?: string) =>
  callAdminApi<AdminAccount>('staff.updateAdminAccountPermissions', { uid, permissions, role }),
listAdminLoginEvents: (page = 1, pageSize = 30) =>
  callAdminApi<PagedResult<AdminLoginEvent>>('staff.listAdminLoginEvents', { page, pageSize }),
```

- [ ] **Step 4: Run the tests to verify the contract passes**

Run:

```powershell
node --test tests/admin-web.test.js
```

Expected: PASS for the new contract assertions; runtime staff actions still remain to be implemented in Task 2.

- [ ] **Step 5: Commit**

```bash
git add admin-web/src/types/admin.ts admin-web/src/lib/admin-api.ts tests/admin-web.test.js
git commit -m "feat: add admin identity api contracts"
```

### Task 2: Implement Backend Role Templates And Admin Account Lifecycle

**Files:**
- Modify: `miniapp/cloudfunctions/adminApi/index.js`
- Modify: `miniapp/cloudfunctions/adminApi/lib/modules-staff.js`
- Modify: `miniapp/cloudfunctions/adminApi/lib/data.js`
- Modify: `tests/admin-web.test.js`
- Test: `tests/admin-web.test.js`

- [ ] **Step 1: Write the failing backend capability test**

```js
test('admin staff module exposes role templates, admin account creation, status updates, and login-event listing', () => {
  const apiSource = fs.readFileSync(path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'index.js'), 'utf8')
  const staffSource = fs.readFileSync(path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'modules-staff.js'), 'utf8')

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
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test tests/admin-web.test.js
```

Expected: FAIL because the action routes and staff lifecycle functions do not exist.

- [ ] **Step 3: Implement role-template and admin-account lifecycle handlers**

```js
// miniapp/cloudfunctions/adminApi/lib/modules-staff.js
async function listRoleTemplates(access) {
  const storeId = getAccessStoreId(access)
  const systemTemplates = await safeList('admin_role_templates', { isSystem: true }, { orderBy: ['roleKey', 'asc'], limit: 50 })
  const storeTemplates = await safeList('admin_role_templates', { storeId }, { orderBy: ['roleKey', 'asc'], limit: 50 })
  return { code: 0, data: [...systemTemplates, ...storeTemplates] }
}

async function createAdminAccount(access, event) {
  const payload = event.payload || {}
  const storeId = getAccessStoreId(access)
  if (!payload.username || !payload.displayName) return { code: -1, msg: '账号信息不完整' }

  const record = {
    uid: String(payload.uid || '').trim(),
    username: String(payload.username).trim(),
    displayName: String(payload.displayName).trim(),
    role: payload.role || 'operator',
    permissions: Array.isArray(payload.permissions) ? payload.permissions : [],
    status: payload.status || 'pending_activation',
    storeId,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
    lastLoginAt: null
  }

  await db.collection('admin_accounts').add({ data: record })
  await writeAuditLog(access, {
    action: 'staff.createAdminAccount',
    module: 'staff',
    targetType: 'admin_account',
    targetId: record.username,
    summary: `创建后台账号 ${record.displayName}`,
    detail: record
  })
  return { code: 0, data: record, msg: '后台账号已创建' }
}
```

```js
// miniapp/cloudfunctions/adminApi/index.js
case 'staff.listRoleTemplates':
  return modulesStaff.listRoleTemplates(access, event)
case 'staff.createAdminAccount':
  return modulesStaff.createAdminAccount(access, event)
case 'staff.updateAdminAccountStatus':
  return modulesStaff.updateAdminAccountStatus(access, event)
case 'staff.updateAdminAccountPermissions':
  return modulesStaff.updateAdminAccountPermissions(access, event)
case 'staff.listAdminLoginEvents':
  return modulesStaff.listAdminLoginEvents(access, event)
```

- [ ] **Step 4: Run the tests to verify the backend capability passes**

Run:

```powershell
node --test tests/admin-web.test.js
```

Expected: PASS for the new staff lifecycle assertions.

- [ ] **Step 5: Commit**

```bash
git add miniapp/cloudfunctions/adminApi/index.js miniapp/cloudfunctions/adminApi/lib/modules-staff.js miniapp/cloudfunctions/adminApi/lib/data.js tests/admin-web.test.js
git commit -m "feat: add admin account lifecycle actions"
```

### Task 3: Upgrade The Staff Page Into A Real Admin Identity Console

**Files:**
- Modify: `admin-web/src/pages/staff-page.tsx`
- Modify: `admin-web/src/types/admin.ts`
- Modify: `admin-web/src/lib/admin-api.ts`
- Test: `tests/admin-web.test.js`

- [ ] **Step 1: Write the failing UI contract test**

```js
test('staff page exposes admin-account creation, status controls, role templates, and login-event views', () => {
  const staffPageSource = fs.readFileSync(path.join(repoRoot, 'admin-web', 'src', 'pages', 'staff-page.tsx'), 'utf8')

  assert.match(staffPageSource, /创建后台账号/)
  assert.match(staffPageSource, /角色模板/)
  assert.match(staffPageSource, /登录日志/)
  assert.match(staffPageSource, /updateAdminAccountStatus/)
  assert.match(staffPageSource, /createAdminAccount/)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test tests/admin-web.test.js
```

Expected: FAIL because the current page is still read-only for web admin accounts.

- [ ] **Step 3: Implement the staff/admin console**

```tsx
// admin-web/src/pages/staff-page.tsx
<Card className="panel-card" title="后台账号管理" extra={<Button type="primary" onClick={() => setAccountDrawerOpen(true)}>创建后台账号</Button>} />
<Card className="panel-card" title="角色模板" />
<Card className="panel-card" title="登录日志" />
```

Include:

- a drawer/form for admin account creation
- role-template table
- admin-account status toggle actions
- permission reassignment for web accounts
- login-event table

- [ ] **Step 4: Run tests and build**

Run:

```powershell
node --test tests/admin-web.test.js
```

Then:

```powershell
npm run build
```

Working directory for build:

```powershell
C:\Users\Administrator\Desktop\裂变小程序\admin-web
```

Expected: tests PASS and the admin-web production build succeeds.

- [ ] **Step 5: Commit**

```bash
git add admin-web/src/pages/staff-page.tsx admin-web/src/types/admin.ts admin-web/src/lib/admin-api.ts tests/admin-web.test.js
git commit -m "feat: build admin identity console"
```

### Task 4: Document Role Templates, Account Lifecycle, And Login Telemetry

**Files:**
- Modify: `docs/database_schema.md`
- Modify: `docs/admin-web-deploy.md`
- Modify: `tests/admin-web.test.js`
- Test: `tests/admin-web.test.js`

- [ ] **Step 1: Write the failing documentation test**

```js
test('phase-b docs describe role templates and admin login telemetry behavior', () => {
  const schemaSource = fs.readFileSync(path.join(repoRoot, 'docs', 'database_schema.md'), 'utf8')
  const deploySource = fs.readFileSync(path.join(repoRoot, 'docs', 'admin-web-deploy.md'), 'utf8')

  assert.match(schemaSource, /admin_role_templates/)
  assert.match(schemaSource, /admin_login_events/)
  assert.match(deploySource, /角色模板/)
  assert.match(deploySource, /后台账号/)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test tests/admin-web.test.js
```

Expected: FAIL because the docs do not yet describe Phase-B identity management.

- [ ] **Step 3: Update docs**

Add:

- `admin_role_templates` schema details
- `admin_accounts` lifecycle statuses and store binding
- `admin_login_events` purpose and current write behavior
- deployment/setup guidance for creating role templates and admin accounts in the new UI

- [ ] **Step 4: Run the full Phase-B regression check**

Run:

```powershell
node --test tests/admin-web.test.js
```

Expected: PASS for all Phase-B contract and documentation assertions.

- [ ] **Step 5: Commit**

```bash
git add docs/database_schema.md docs/admin-web-deploy.md tests/admin-web.test.js
git commit -m "docs: record admin identity phase"
```

## Self-Review

- Spec coverage: this plan covers the Phase-B identity center only: admin account lifecycle, role templates, permission reassignment, and login logs.
- Placeholder scan: no placeholder tasks remain; every step contains file paths and verification commands.
- Type consistency: all new UI/runtime work depends on the existing Phase-A dotted permission contract rather than reintroducing legacy identifiers.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-15-admin-identity-phase-b.md`.

Because the user requested ongoing parallel development, execute this plan using `superpowers:subagent-driven-development` with Task 1 first, then Task 2, then Task 3, then Task 4. Do not start orders/finance/catalog work until this identity plan is green.
