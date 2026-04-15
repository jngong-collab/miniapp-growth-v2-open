# Verification Console Phase C2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first web-based verification workflow: query verification codes, inspect service/package remaining usage, complete verification from the admin web, and expose a direct entry from the dashboard.

**Architecture:** Reuse the verification data already written in `order_items` and `package_usage`. Add `adminApi` verification handlers that mirror the current ops behavior without inventing a new fulfillment model. Then add a dedicated web page and wire the dashboard counter into that route.

**Tech Stack:** React, TypeScript, Ant Design, TanStack Query, CloudBase Web SDK, wx-server-sdk cloud functions, node:test

---

### Task 1: Add Verification Actions To adminApi

**Files:**
- Modify: `miniapp/cloudfunctions/adminApi/index.js`
- Modify: `miniapp/cloudfunctions/adminApi/lib/modules-orders.js`
- Modify: `tests/admin-web.test.js`

- [ ] **Step 1: Write the failing backend contract test**

```js
test('admin api exposes verification query and verify actions', () => {
  const apiSource = fs.readFileSync(path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'index.js'), 'utf8')
  const ordersSource = fs.readFileSync(path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'modules-orders.js'), 'utf8')

  assert.match(apiSource, /case 'orders\.queryVerifyCode'/)
  assert.match(apiSource, /case 'orders\.verifyOrderItem'/)
  assert.match(ordersSource, /async function queryVerifyCode/)
  assert.match(ordersSource, /async function verifyOrderItem/)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test tests/admin-web.test.js
```

Expected: FAIL because the verification actions do not exist yet.

- [ ] **Step 3: Implement admin verification handlers**

Add to `modules-orders.js`:

- `queryVerifyCode(access, event)`
- `verifyOrderItem(access, event)`

Required behavior:

- accept `verifyCode`
- load the matching `order_items` record for `service` or `package`
- ensure the parent order exists and is in a payable/usable state
- return verification details already needed by the UI:
  - product name/type
  - verify code
  - package items
  - package remaining
  - expiry
- on verify:
  - decrement package remaining for package items
  - mark service item as used for non-package service items
  - insert a `package_usage` row
  - write an admin audit log

Wire both actions in `adminApi/index.js` under `orders.view`.

- [ ] **Step 4: Run the test to verify the backend contract passes**

Run:

```powershell
node --test tests/admin-web.test.js
```

Expected: PASS for the verification action assertions.

- [ ] **Step 5: Commit**

```bash
git add miniapp/cloudfunctions/adminApi/index.js miniapp/cloudfunctions/adminApi/lib/modules-orders.js tests/admin-web.test.js
git commit -m "feat: add admin verification actions"
```

### Task 2: Extend Frontend Order API And Types For Verification Console

**Files:**
- Modify: `admin-web/src/types/admin.ts`
- Modify: `admin-web/src/lib/admin-api.ts`
- Modify: `tests/admin-web.test.js`

- [ ] **Step 1: Write the failing frontend contract test**

```js
test('admin web api exposes verification console methods and payload types', () => {
  const apiSource = fs.readFileSync(path.join(repoRoot, 'admin-web', 'src', 'lib', 'admin-api.ts'), 'utf8')
  const typeSource = fs.readFileSync(path.join(repoRoot, 'admin-web', 'src', 'types', 'admin.ts'), 'utf8')

  assert.match(apiSource, /queryVerifyCode/)
  assert.match(apiSource, /verifyOrderItem/)
  assert.match(typeSource, /export interface VerificationLookup/)
  assert.match(typeSource, /export interface VerificationUsageRecord/)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test tests/admin-web.test.js
```

Expected: FAIL because the verification DTOs and methods do not exist yet.

- [ ] **Step 3: Add verification DTOs and client methods**

Add to `admin.ts`:

- `VerificationLookup`
- `VerificationUsageRecord`

Add to `admin-api.ts`:

- `queryVerifyCode(verifyCode: string)`
- `verifyOrderItem(verifyCode: string, serviceName?: string)`

- [ ] **Step 4: Run the test to verify the contract passes**

Run:

```powershell
node --test tests/admin-web.test.js
```

Expected: PASS for the new verification contract assertions.

- [ ] **Step 5: Commit**

```bash
git add admin-web/src/types/admin.ts admin-web/src/lib/admin-api.ts tests/admin-web.test.js
git commit -m "feat: add verification console api contract"
```

### Task 3: Build The Web Verification Console And Dashboard Entry

**Files:**
- Create: `admin-web/src/pages/verification-page.tsx`
- Modify: `admin-web/src/App.tsx`
- Modify: `admin-web/src/layouts/admin-shell.tsx`
- Modify: `admin-web/src/pages/dashboard-page.tsx`
- Modify: `tests/admin-web.test.js`

- [ ] **Step 1: Write the failing UI contract test**

```js
test('admin web exposes a dedicated verification page and dashboard entry', () => {
  const appSource = fs.readFileSync(path.join(repoRoot, 'admin-web', 'src', 'App.tsx'), 'utf8')
  const shellSource = fs.readFileSync(path.join(repoRoot, 'admin-web', 'src', 'layouts', 'admin-shell.tsx'), 'utf8')
  const dashboardSource = fs.readFileSync(path.join(repoRoot, 'admin-web', 'src', 'pages', 'dashboard-page.tsx'), 'utf8')

  assert.match(appSource, /verification/)
  assert.match(shellSource, /核销/)
  assert.match(dashboardSource, /待核销服务/)
  assert.match(dashboardSource, /navigate\('\/verification'/)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test tests/admin-web.test.js
```

Expected: FAIL because there is no verification route/page yet.

- [ ] **Step 3: Implement the page and wire it in**

The page must provide:

- verification code input
- query action
- detail display for service/package usage
- service picker for package items with remaining count
- verify action
- success/error state feedback

Wire:

- route `/verification`
- sidebar item labeled `核销台`
- dashboard `待核销服务` card click-through to `/verification`

Use `orders.view` permission for this slice to avoid widening the Phase-A permission contract mid-stream.

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

Expected: tests PASS and the web build succeeds.

- [ ] **Step 5: Commit**

```bash
git add admin-web/src/pages/verification-page.tsx admin-web/src/App.tsx admin-web/src/layouts/admin-shell.tsx admin-web/src/pages/dashboard-page.tsx tests/admin-web.test.js
git commit -m "feat: add web verification console"
```

### Task 4: Document The Web Verification Slice

**Files:**
- Modify: `docs/admin-web-deploy.md`
- Modify: `docs/database_schema.md`
- Modify: `tests/admin-web.test.js`

- [ ] **Step 1: Write the failing documentation test**

```js
test('docs describe the web verification console and package_usage linkage', () => {
  const schemaSource = fs.readFileSync(path.join(repoRoot, 'docs', 'database_schema.md'), 'utf8')
  const deploySource = fs.readFileSync(path.join(repoRoot, 'docs', 'admin-web-deploy.md'), 'utf8')

  assert.match(schemaSource, /package_usage/)
  assert.match(deploySource, /核销台|verification/)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test tests/admin-web.test.js
```

Expected: FAIL because docs do not yet mention the web verification slice.

- [ ] **Step 3: Update docs**

Document:

- web verification route
- verification data source in `order_items`
- `package_usage` row creation
- current limitation: this slice is for direct code lookup and verification, not a full fulfillment report center yet

- [ ] **Step 4: Run the full regression check**

Run:

```powershell
node --test tests/admin-web.test.js tests/refund-state-machine.test.js
```

Expected: PASS for all verification slice assertions.

- [ ] **Step 5: Commit**

```bash
git add docs/admin-web-deploy.md docs/database_schema.md tests/admin-web.test.js
git commit -m "docs: record web verification slice"
```

## Self-Review

- Spec coverage: this plan covers the next Phase-C slice only: web verification console and dashboard entry.
- Placeholder scan: no placeholders remain.
- Type consistency: verification DTOs are introduced in Task 2 and consumed in Task 3.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-15-verification-console-phase-c2.md`.

Execute with `superpowers:subagent-driven-development` in order: Task 1, Task 2, Task 3, Task 4.
