# Orders And Fulfillment Phase C Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first real Phase-C slice of the order/fulfillment center by unifying the refund state machine, exposing fulfillment/verification data in the admin order contract, and preparing the web admin for verification-focused workflows.

**Architecture:** Unify refund lifecycle semantics first so `adminApi`, `opsApi`, and `payApi` stop drifting. Then extend order DTOs and the order detail page to surface fulfillment/package fields that already exist in checkout data. Keep Phase C focused on contract correctness before adding a full verification console.

**Tech Stack:** React, TypeScript, Ant Design, TanStack Query, CloudBase Web SDK, wx-server-sdk cloud functions, node:test

---

### Task 1: Normalize Refund Lifecycle Around The Shared State Machine

**Files:**
- Modify: `miniapp/cloudfunctions/adminApi/lib/refund.js`
- Modify: `miniapp/cloudfunctions/adminApi/lib/modules-orders.js`
- Modify: `miniapp/cloudfunctions/opsApi/refund-state-machine.js`
- Modify: `tests/refund-state-machine.test.js`
- Modify: `tests/admin-web.test.js`

- [ ] **Step 1: Write the failing lifecycle regression tests**

```js
test('refund state machine exposes pending -> refunding -> refunded flow', () => {
  const { planEnterRefunding, planFinalizeRefund } = require('../miniapp/cloudfunctions/opsApi/refund-state-machine')

  const enterPlan = planEnterRefunding({
    request: { status: 'pending' },
    order: { status: 'refund_requested' },
    reviewerOpenid: 'uid-admin',
    generatedOutRefundNo: 'RFD123',
    now: 'NOW'
  })

  assert.equal(enterPlan.requestUpdate.status, 'refunding')
  assert.equal(enterPlan.orderUpdate.status, 'refunding')

  const finalizePlan = planFinalizeRefund({
    request: { status: 'refunding' },
    order: { status: 'refunding' },
    reviewerOpenid: 'uid-admin',
    outRefundNo: 'RFD123',
    refundResult: { refundId: 'wx-refund-1', resultCode: 'SUCCESS', returnCode: 'SUCCESS' },
    now: 'NOW'
  })

  assert.equal(finalizePlan.requestUpdate.status, 'refunded')
  assert.equal(finalizePlan.orderUpdate.status, 'refunded')
})

test('admin refund implementation uses refunding intermediate state before finalize', () => {
  const refundSource = fs.readFileSync(path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'refund.js'), 'utf8')
  assert.match(refundSource, /planEnterRefunding/)
  assert.match(refundSource, /planFinalizeRefund/)
  assert.match(refundSource, /status:\s*'refunding'/)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```powershell
node --test tests/refund-state-machine.test.js tests/admin-web.test.js
```

Expected: FAIL because `adminApi/lib/refund.js` still jumps directly to `refunded`.

- [ ] **Step 3: Refactor admin refund flow onto the shared state machine**

```js
// miniapp/cloudfunctions/adminApi/lib/refund.js
const { planEnterRefunding, planFinalizeRefund } = require('../../opsApi/refund-state-machine')

const enterPlan = planEnterRefunding({
  request,
  order,
  reviewerOpenid: reviewerUid,
  generatedOutRefundNo: outRefundNo,
  now: db.serverDate()
})

await db.runTransaction(async transaction => {
  if (enterPlan.requestUpdate) {
    await transaction.collection('refund_requests').doc(request._id).update({ data: enterPlan.requestUpdate })
  }
  if (enterPlan.orderUpdate) {
    await transaction.collection('orders').doc(order._id).update({ data: enterPlan.orderUpdate })
  }
})

const finalizePlan = planFinalizeRefund({
  request: { ...request, status: 'refunding' },
  order: { ...order, status: 'refunding' },
  reviewerOpenid: reviewerUid,
  outRefundNo: enterPlan.outRefundNo,
  refundResult,
  now: db.serverDate()
})
```

Also update `modules-orders.js` to keep rejection behavior aligned with the state machine vocabulary.

- [ ] **Step 4: Run the tests to verify the lifecycle passes**

Run:

```powershell
node --test tests/refund-state-machine.test.js tests/admin-web.test.js
```

Expected: PASS for the refund lifecycle assertions.

- [ ] **Step 5: Commit**

```bash
git add miniapp/cloudfunctions/adminApi/lib/refund.js miniapp/cloudfunctions/adminApi/lib/modules-orders.js miniapp/cloudfunctions/opsApi/refund-state-machine.js tests/refund-state-machine.test.js tests/admin-web.test.js
git commit -m "fix: unify admin refund lifecycle"
```

### Task 2: Extend Order Contracts With Fulfillment And Verification Data

**Files:**
- Modify: `miniapp/cloudfunctions/adminApi/lib/modules-orders.js`
- Modify: `miniapp/cloudfunctions/adminApi/lib/helpers.js`
- Modify: `admin-web/src/types/admin.ts`
- Modify: `admin-web/src/lib/admin-api.ts`
- Modify: `tests/admin-web.test.js`

- [ ] **Step 1: Write the failing order contract tests**

```js
test('order detail types include fulfillment and verification fields', () => {
  const typeSource = fs.readFileSync(path.join(repoRoot, 'admin-web', 'src', 'types', 'admin.ts'), 'utf8')
  assert.match(typeSource, /verifyCode/)
  assert.match(typeSource, /packageRemaining/)
  assert.match(typeSource, /packageExpireAt/)
  assert.match(typeSource, /verificationStatus/)
})

test('admin order module maps verification data into order detail payloads', () => {
  const ordersSource = fs.readFileSync(path.join(repoRoot, 'miniapp', 'cloudfunctions', 'adminApi', 'lib', 'modules-orders.js'), 'utf8')
  assert.match(ordersSource, /verifyCode/)
  assert.match(ordersSource, /packageRemaining/)
  assert.match(ordersSource, /packageExpireAt/)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```powershell
node --test tests/admin-web.test.js
```

Expected: FAIL because the current order DTOs do not expose fulfillment/package fields.

- [ ] **Step 3: Add fulfillment-aware order DTOs**

```ts
// admin-web/src/types/admin.ts
export interface OrderItemDetail {
  _id?: string
  productName: string
  productType: string
  quantity: number
  price: number
  totalAmount: number
  verifyCode?: string
  packageRemaining?: number
  packageExpireAt?: unknown
  verificationStatus?: string
}
```

```js
// miniapp/cloudfunctions/adminApi/lib/modules-orders.js
detail.items = items.map(item => ({
  ...item,
  totalAmount: Number(item.totalAmount || (item.price || 0) * (item.quantity || 1)),
  verifyCode: item.verifyCode || '',
  packageRemaining: Number(item.packageRemaining || 0),
  packageExpireAt: item.packageExpireAt || null,
  verificationStatus: item.packageRemaining > 0 ? 'unused' : 'used'
}))
```

- [ ] **Step 4: Run the tests to verify the contract passes**

Run:

```powershell
node --test tests/admin-web.test.js
```

Expected: PASS for the new order detail contract assertions.

- [ ] **Step 5: Commit**

```bash
git add miniapp/cloudfunctions/adminApi/lib/modules-orders.js miniapp/cloudfunctions/adminApi/lib/helpers.js admin-web/src/types/admin.ts admin-web/src/lib/admin-api.ts tests/admin-web.test.js
git commit -m "feat: expose fulfillment fields in order detail"
```

### Task 3: Upgrade The Orders Page For Fulfillment Visibility

**Files:**
- Modify: `admin-web/src/pages/orders-page.tsx`
- Modify: `admin-web/src/types/admin.ts`
- Modify: `tests/admin-web.test.js`

- [ ] **Step 1: Write the failing UI contract test**

```js
test('orders page displays fulfillment and verification details in the order drawer', () => {
  const ordersPageSource = fs.readFileSync(path.join(repoRoot, 'admin-web', 'src', 'pages', 'orders-page.tsx'), 'utf8')
  assert.match(ordersPageSource, /核销码/)
  assert.match(ordersPageSource, /剩余次数/)
  assert.match(ordersPageSource, /有效期/)
  assert.match(ordersPageSource, /退款时间线/)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test tests/admin-web.test.js
```

Expected: FAIL because the drawer does not yet show fulfillment/package details.

- [ ] **Step 3: Render fulfillment/package details in the order drawer**

Add to `orders-page.tsx`:

- item-level verification code
- package remaining count
- package expiry date
- more explicit refund/fulfillment state labeling

Do not add new write actions yet.

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

Expected: tests PASS and the admin-web build succeeds.

- [ ] **Step 5: Commit**

```bash
git add admin-web/src/pages/orders-page.tsx admin-web/src/types/admin.ts tests/admin-web.test.js
git commit -m "feat: show fulfillment details in orders drawer"
```

### Task 4: Document The Unified Refund Lifecycle

**Files:**
- Modify: `docs/database_schema.md`
- Modify: `docs/admin-web-deploy.md`
- Modify: `tests/admin-web.test.js`

- [ ] **Step 1: Write the failing documentation test**

```js
test('phase-c docs describe refunding as the shared intermediate refund state', () => {
  const schemaSource = fs.readFileSync(path.join(repoRoot, 'docs', 'database_schema.md'), 'utf8')
  const deploySource = fs.readFileSync(path.join(repoRoot, 'docs', 'admin-web-deploy.md'), 'utf8')

  assert.match(schemaSource, /refunding/)
  assert.match(deploySource, /退款中|refunding/)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test tests/admin-web.test.js
```

Expected: FAIL because docs do not yet describe the unified refunding state.

- [ ] **Step 3: Update docs**

Document:

- shared refund status vocabulary
- `pending -> refunding -> refunded` flow
- rejection path back to the previous payable order status
- current scope limitation: no standalone web verification console yet in this slice

- [ ] **Step 4: Run the full Phase-C slice regression check**

Run:

```powershell
node --test tests/admin-web.test.js tests/refund-state-machine.test.js
```

Expected: PASS for the lifecycle and documentation assertions.

- [ ] **Step 5: Commit**

```bash
git add docs/database_schema.md docs/admin-web-deploy.md tests/admin-web.test.js
git commit -m "docs: record unified refund lifecycle"
```

## Self-Review

- Spec coverage: this plan covers the first Phase-C slice only: refund lifecycle unification and fulfillment visibility in admin order detail.
- Placeholder scan: no placeholders remain.
- Type consistency: order detail fulfillment fields are introduced in Task 2 and consumed in Task 3.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-15-orders-fulfillment-phase-c.md`.

Execute with `superpowers:subagent-driven-development` in order: Task 1, Task 2, Task 3, Task 4. Do not start a dedicated verification console until this slice is green.
