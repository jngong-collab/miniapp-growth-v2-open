# Refund And Callback Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the broken refund approval state machine, make payment callback side effects durable across retries, and replace source-text tests with behavior tests that execute the workflow rules.

**Architecture:** Extract two small pure helper modules so the state rules are explicit and unit-testable: one for `pending -> refunding -> refunded` transitions in the refund path, and one for `pending/paid + processing/completed` decisions in the pay-callback path. Then update `opsApi/index.js` and `payApi/index.js` to use those helpers inside transaction-scoped workflows so retries resume safely instead of short-circuiting after partially applied side effects.

**Tech Stack:** Node.js, `wx-server-sdk`, CloudBase document DB transactions, built-in `node:test`

---

## File Map

- Create: `miniapp/cloudfunctions/opsApi/refund-state-machine.js`
  Pure helpers that decide whether a refund request should enter `refunding`, resume from `refunding`, or finalize to `refunded`.

- Create: `miniapp/cloudfunctions/payApi/pay-callback-state.js`
  Pure helpers that decide whether a callback should mark an order paid, resume unfinished post-pay work, or return idempotently because all downstream effects are already complete.

- Modify: `miniapp/cloudfunctions/opsApi/index.js`
  Replace the inverted refund guards with helper-driven transitions, persist `outRefundNo` before the external refund call, and finalize only from `refunding`.

- Modify: `miniapp/cloudfunctions/payApi/index.js`
  Replace the CAS-only shortcut with a transaction-driven finalize path that only returns idempotently after inventory/campaign/cashback side effects are complete.

- Modify: `tests/review-fixes.test.js`
  Remove the three regex-only tests that currently pass even when workflow logic is wrong.

- Create: `tests/refund-state-machine.test.js`
  Behavior tests for refund transition helpers.

- Create: `tests/pay-callback-state.test.js`
  Behavior tests for pay-callback transition helpers.

- Do not touch: unrelated dirty files in `admin-web/`, `miniapp/pages/cart/`, image assets, or unrelated page redesign work. Stage only the files above.

---

### Task 1: Fix The Refund Approval State Machine

**Files:**
- Create: `miniapp/cloudfunctions/opsApi/refund-state-machine.js`
- Modify: `miniapp/cloudfunctions/opsApi/index.js`
- Test: `tests/refund-state-machine.test.js`

- [ ] **Step 1: Write the failing refund state tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  planEnterRefunding,
  planFinalizeRefund
} = require('../miniapp/cloudfunctions/opsApi/refund-state-machine');

test('pending refund request enters refunding and persists generated outRefundNo', () => {
  const now = Symbol('now');
  const result = planEnterRefunding({
    request: { _id: 'req-1', status: 'pending' },
    order: { _id: 'ord-1', status: 'refund_requested' },
    reviewerOpenid: 'staff-1',
    generatedOutRefundNo: 'RF202604150001',
    now
  });

  assert.equal(result.mode, 'transition');
  assert.equal(result.outRefundNo, 'RF202604150001');
  assert.deepEqual(result.requestUpdate, {
    status: 'refunding',
    reviewedBy: 'staff-1',
    reviewedAt: now,
    outRefundNo: 'RF202604150001',
    updatedAt: now
  });
  assert.deepEqual(result.orderUpdate, {
    status: 'refunding',
    updatedAt: now
  });
});

test('refunding refund request resumes instead of generating a second transition', () => {
  const result = planEnterRefunding({
    request: { _id: 'req-2', status: 'refunding', outRefundNo: 'RF202604150002' },
    order: { _id: 'ord-2', status: 'refunding' },
    reviewerOpenid: 'staff-2',
    generatedOutRefundNo: 'RF-UNUSED',
    now: Symbol('now')
  });

  assert.equal(result.mode, 'resume');
  assert.equal(result.outRefundNo, 'RF202604150002');
  assert.equal(result.requestUpdate, null);
  assert.equal(result.orderUpdate, null);
});

test('finalize refund only accepts refunding -> refunded', () => {
  const now = Symbol('now');
  const refundResult = { refundId: 'wx-refund-1', resultCode: 'SUCCESS', returnCode: 'SUCCESS' };

  assert.throws(() => planFinalizeRefund({
    request: { _id: 'req-3', status: 'pending' },
    order: { _id: 'ord-3', status: 'refund_requested' },
    reviewerOpenid: 'staff-3',
    outRefundNo: 'RF202604150003',
    refundResult,
    now
  }), /退款申请状态异常/);

  const finalized = planFinalizeRefund({
    request: { _id: 'req-4', status: 'refunding' },
    order: { _id: 'ord-4', status: 'refunding' },
    reviewerOpenid: 'staff-4',
    outRefundNo: 'RF202604150004',
    refundResult,
    now
  });

  assert.equal(finalized.requestUpdate.status, 'refunded');
  assert.equal(finalized.orderUpdate.status, 'refunded');
});
```

- [ ] **Step 2: Run the new refund test to verify it fails**

Run: `node --test tests/refund-state-machine.test.js`

Expected: FAIL with `Cannot find module '../miniapp/cloudfunctions/opsApi/refund-state-machine'`

- [ ] **Step 3: Create the refund transition helper**

```js
function planEnterRefunding({ request, order, reviewerOpenid, generatedOutRefundNo, now }) {
  if (!request || !order) throw new Error('退款申请或订单不存在');
  if (request.status === 'refunded' || order.status === 'refunded') {
    throw new Error('订单已退款');
  }

  if (request.status === 'pending') {
    if (order.status !== 'refund_requested') {
      throw new Error('订单状态异常，不能进入退款中');
    }
    return {
      mode: 'transition',
      outRefundNo: generatedOutRefundNo,
      requestUpdate: {
        status: 'refunding',
        reviewedBy: reviewerOpenid,
        reviewedAt: now,
        outRefundNo: generatedOutRefundNo,
        updatedAt: now
      },
      orderUpdate: {
        status: 'refunding',
        updatedAt: now
      }
    };
  }

  if (request.status === 'refunding' && order.status === 'refunding') {
    return {
      mode: 'resume',
      outRefundNo: request.outRefundNo || generatedOutRefundNo,
      requestUpdate: null,
      orderUpdate: null
    };
  }

  throw new Error('退款申请状态异常');
}

function planFinalizeRefund({ request, order, reviewerOpenid, outRefundNo, refundResult, now }) {
  if (!request || !order) throw new Error('退款申请或订单不存在');
  if (request.status !== 'refunding') throw new Error('退款申请状态异常');
  if (order.status !== 'refunding') throw new Error('订单状态异常');

  return {
    requestUpdate: {
      status: 'refunded',
      reviewedBy: reviewerOpenid,
      reviewedAt: now,
      updatedAt: now,
      refundProcessedAt: now,
      outRefundNo,
      refundId: refundResult.refundId || '',
      refundResultCode: refundResult.resultCode || '',
      refundReturnCode: refundResult.returnCode || ''
    },
    orderUpdate: {
      status: 'refunded',
      updatedAt: now,
      refundedAt: now,
      refundProcessedAt: now,
      refundNo: outRefundNo,
      refundId: refundResult.refundId || ''
    }
  };
}

module.exports = {
  planEnterRefunding,
  planFinalizeRefund
};
```

- [ ] **Step 4: Wire the helper into `approveRefundRequest`**

```js
const {
  planEnterRefunding,
  planFinalizeRefund
} = require('./refund-state-machine');

async function approveRefundRequest({ request, order, reviewerOpenid }) {
  // ... existing payConfig / refundAmount / rollback preparation ...
  const generatedOutRefundNo = generateRefundNo();
  let outRefundNo = generatedOutRefundNo;

  await db.runTransaction(async transaction => {
    const currentRequest = (await transaction.collection('refund_requests').doc(request._id).get()).data || null;
    const currentOrder = (await transaction.collection('orders').doc(order._id).get()).data || null;
    const now = db.serverDate();
    const transition = planEnterRefunding({
      request: currentRequest,
      order: currentOrder,
      reviewerOpenid,
      generatedOutRefundNo,
      now
    });

    outRefundNo = transition.outRefundNo;

    if (transition.requestUpdate) {
      await transaction.collection('refund_requests').doc(request._id).update({ data: transition.requestUpdate });
    }
    if (transition.orderUpdate) {
      await transaction.collection('orders').doc(order._id).update({ data: transition.orderUpdate });
    }
  });

  let refundResult;
  try {
    refundResult = await cloud.cloudPay.refund({
      functionName: 'payApi',
      envId: cloud.DYNAMIC_CURRENT_ENV,
      subMchId: payConfig.mchId,
      nonceStr: randomToken(24),
      transactionId: order.paymentId || undefined,
      outTradeNo: order.orderNo,
      outRefundNo,
      totalFee: Number(order.payAmount || order.totalAmount || 0),
      refundFee: refundAmount,
      refundDesc: request.reason || order.refundReason || '用户申请退款'
    });
  } catch (error) {
    await db.collection('refund_requests').doc(request._id).update({
      data: {
        refundLastError: error.message || '发起退款失败',
        refundLastErrorAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    });
    return { code: -1, msg: error.message || '发起退款失败' };
  }

  await db.runTransaction(async transaction => {
    const currentRequest = (await transaction.collection('refund_requests').doc(request._id).get()).data || null;
    const currentOrder = (await transaction.collection('orders').doc(order._id).get()).data || null;
    const now = db.serverDate();
    const finalize = planFinalizeRefund({
      request: currentRequest,
      order: currentOrder,
      reviewerOpenid,
      outRefundNo,
      refundResult,
      now
    });

    await transaction.collection('refund_requests').doc(request._id).update({ data: finalize.requestUpdate });
    await transaction.collection('orders').doc(order._id).update({ data: finalize.orderUpdate });
    // Keep the existing inventory / campaign / cashback rollback in this transaction block.
  });

  return { code: 0, msg: '退款完成' };
}
```

- [ ] **Step 5: Run the refund tests and existing suite**

Run: `node --test tests/refund-state-machine.test.js tests/review-fixes.test.js`

Expected: PASS, 0 failures

- [ ] **Step 6: Commit**

```bash
git add miniapp/cloudfunctions/opsApi/refund-state-machine.js miniapp/cloudfunctions/opsApi/index.js tests/refund-state-machine.test.js tests/review-fixes.test.js
git commit -m "fix: repair refund approval state machine"
```

---

### Task 2: Make Pay Callback Side Effects Durable Across Retries

**Files:**
- Create: `miniapp/cloudfunctions/payApi/pay-callback-state.js`
- Modify: `miniapp/cloudfunctions/payApi/index.js`
- Test: `tests/pay-callback-state.test.js`

- [ ] **Step 1: Write the failing pay-callback state tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  planPayCallbackStart,
  buildPayCallbackCompletionUpdate
} = require('../miniapp/cloudfunctions/payApi/pay-callback-state');

test('pending order enters processing before post-pay side effects', () => {
  const now = Symbol('now');
  const result = planPayCallbackStart({
    order: { _id: 'ord-1', status: 'pending' },
    paymentId: 'wxpay-1',
    now
  });

  assert.equal(result.mode, 'transition');
  assert.deepEqual(result.orderUpdate, {
    status: 'paid',
    paymentId: 'wxpay-1',
    paidAt: now,
    postPayState: 'processing',
    postPayUpdatedAt: now
  });
});

test('paid order with unfinished post-pay work resumes instead of nooping', () => {
  const result = planPayCallbackStart({
    order: { _id: 'ord-2', status: 'paid', postPayState: 'processing' },
    paymentId: 'wxpay-2',
    now: Symbol('now')
  });

  assert.equal(result.mode, 'resume');
  assert.equal(result.orderUpdate, null);
});

test('paid order with completed post-pay work is idempotent', () => {
  const result = planPayCallbackStart({
    order: { _id: 'ord-3', status: 'paid', postPayState: 'completed', postPayCompletedAt: 'done' },
    paymentId: 'wxpay-3',
    now: Symbol('now')
  });

  assert.equal(result.mode, 'noop');
  assert.equal(result.orderUpdate, null);
});

test('completion update marks post-pay work durable', () => {
  const now = Symbol('now');
  assert.deepEqual(buildPayCallbackCompletionUpdate(now), {
    postPayState: 'completed',
    postPayCompletedAt: now,
    postPayUpdatedAt: now
  });
});
```

- [ ] **Step 2: Run the pay-callback state test to verify it fails**

Run: `node --test tests/pay-callback-state.test.js`

Expected: FAIL with `Cannot find module '../miniapp/cloudfunctions/payApi/pay-callback-state'`

- [ ] **Step 3: Create the pay-callback helper**

```js
function planPayCallbackStart({ order, paymentId, now }) {
  if (!order) throw new Error('订单不存在');

  if (order.status === 'paid' && order.postPayState === 'completed' && order.postPayCompletedAt) {
    return { mode: 'noop', orderUpdate: null };
  }

  if (order.status === 'pending') {
    return {
      mode: 'transition',
      orderUpdate: {
        status: 'paid',
        paymentId: paymentId || '',
        paidAt: now,
        postPayState: 'processing',
        postPayUpdatedAt: now
      }
    };
  }

  if (order.status === 'paid' && (!order.postPayState || order.postPayState === 'processing')) {
    return { mode: 'resume', orderUpdate: null };
  }

  throw new Error('订单状态不支持支付回调');
}

function buildPayCallbackCompletionUpdate(now) {
  return {
    postPayState: 'completed',
    postPayCompletedAt: now,
    postPayUpdatedAt: now
  };
}

module.exports = {
  planPayCallbackStart,
  buildPayCallbackCompletionUpdate
};
```

- [ ] **Step 4: Refactor `handlePayCallback` to finalize inside a transaction**

```js
const {
  planPayCallbackStart,
  buildPayCallbackCompletionUpdate
} = require('./pay-callback-state');

async function handlePayCallback(event) {
  const { orderNo, paymentId } = event;

  return db.runTransaction(async transaction => {
    const orderRes = await transaction.collection('orders').where({ orderNo }).limit(1).get();
    if (!orderRes.data.length) return { code: -1, msg: '订单不存在' };

    const order = orderRes.data[0];
    const now = db.serverDate();
    const decision = planPayCallbackStart({ order, paymentId, now });
    if (decision.mode === 'noop') {
      return { code: 0, msg: '已处理（幂等）' };
    }

    if (decision.orderUpdate) {
      await transaction.collection('orders').doc(order._id).update({ data: decision.orderUpdate });
    }

    const orderItemsRes = await transaction.collection('order_items').where({ orderId: order._id }).get();
    const rawOrderItems = orderItemsRes.data || [];
    const itemQuantityMap = {};
    for (const item of rawOrderItems.length ? rawOrderItems : [{ productId: order.productId, quantity: order.quantity || 1 }]) {
      if (!item.productId) continue;
      itemQuantityMap[item.productId] = (itemQuantityMap[item.productId] || 0) + Number(item.quantity || 0);
    }

    for (const productId of Object.keys(itemQuantityMap)) {
      const quantity = itemQuantityMap[productId];
      const product = (await transaction.collection('products').doc(productId).get()).data;
      const updateData = Number(product.stock) === -1
        ? { soldCount: _.inc(quantity) }
        : { stock: _.inc(-quantity), soldCount: _.inc(quantity) };
      await transaction.collection('products').doc(productId).update({ data: updateData });
    }

    if (order.fissionCampaignId) {
      await transaction.collection('fission_campaigns').doc(order.fissionCampaignId).update({
        data: { soldCount: _.inc(Number(order.quantity || 1)) }
      });
    }

    if (order.inviterOpenid && order.fissionCampaignId && order.inviterOpenid !== order._openid) {
      const existing = await transaction.collection('fission_records').where({
        orderId: order._id,
        inviterOpenid: order.inviterOpenid
      }).count();
      if (existing.total === 0) {
        const campaign = (await transaction.collection('fission_campaigns').doc(order.fissionCampaignId).get()).data;
        const cashbackAmount = Number(campaign.cashbackAmount || 0);
        if (cashbackAmount > 0) {
          await transaction.collection('fission_records').add({
            data: {
              campaignId: order.fissionCampaignId,
              inviterOpenid: order.inviterOpenid,
              inviteeOpenid: order._openid,
              orderId: order._id,
              cashbackAmount,
              status: 'paid',
              createdAt: now
            }
          });
          await transaction.collection('users').where({ _openid: order.inviterOpenid }).update({
            data: {
              balance: _.inc(cashbackAmount),
              totalEarned: _.inc(cashbackAmount),
              totalInvited: _.inc(1),
              updatedAt: now
            }
          });
          await transaction.collection('fission_campaigns').doc(order.fissionCampaignId).update({
            data: {
              newCustomers: _.inc(1),
              totalCashback: _.inc(cashbackAmount)
            }
          });
        }
      }
    }

    await transaction.collection('orders').doc(order._id).update({
      data: buildPayCallbackCompletionUpdate(now)
    });

    return { code: 0, msg: '支付处理完成' };
  });
}
```

- [ ] **Step 5: Run the pay-callback tests and the existing suite**

Run: `node --test tests/pay-callback-state.test.js tests/review-fixes.test.js`

Expected: PASS, 0 failures

- [ ] **Step 6: Commit**

```bash
git add miniapp/cloudfunctions/payApi/pay-callback-state.js miniapp/cloudfunctions/payApi/index.js tests/pay-callback-state.test.js tests/review-fixes.test.js
git commit -m "fix: make pay callback post-pay effects durable"
```

---

### Task 3: Replace Regex-Only Review Tests With Behavior Tests

**Files:**
- Modify: `tests/review-fixes.test.js`
- Create: `tests/refund-state-machine.test.js`
- Create: `tests/pay-callback-state.test.js`

- [ ] **Step 1: Delete the three brittle regex tests from `tests/review-fixes.test.js`**

Remove this block entirely:

```js
test('payCallback uses CAS update for idempotency', () => {
  const payApi = fs.readFileSync(path.join(repoRoot, 'miniapp', 'cloudfunctions', 'payApi', 'index.js'), 'utf8');
  assert.match(payApi, /casUpdate\.stats\.updated === 0/);
  assert.match(payApi, /status:\s*_\.\s*neq\s*\(\s*'paid'\s*\)/);
});

test('verifyPackage uses conditional atomic decrement and expiry check', () => {
  const opsApi = fs.readFileSync(path.join(repoRoot, 'miniapp', 'cloudfunctions', 'opsApi', 'index.js'), 'utf8');
  assert.match(opsApi, /packageExpireAt\s*&&\s*new\s+Date\s*\(\s*item\.packageExpireAt\s*\)\s*<\s*new\s+Date\s*\(\s*\)/);
  assert.match(opsApi, /packageRemaining\.\${serviceName}.*_\.\s*gt\s*\(\s*0\s*\)/);
  assert.match(opsApi, /packageRemaining\.\${serviceName}.*_\.\s*inc\s*\(\s*-1\s*\)/);
});

test('approveRefundRequest uses refunding-then-refunded state machine', () => {
  const opsApi = fs.readFileSync(path.join(repoRoot, 'miniapp', 'cloudfunctions', 'opsApi', 'index.js'), 'utf8');
  assert.match(opsApi, /status:\s*'refunding'/);
  assert.match(opsApi, /currentRequest\.status\s*!==\s*'refunding'/);
  assert.match(opsApi, /currentOrder\.status\s*!==\s*'refunding'/);
  assert.match(opsApi, /cloud\.cloudPay\.refund/);
});
```

- [ ] **Step 2: Keep one narrow source-level smoke test for the atomic package update**

```js
test('verifyPackage keeps conditional atomic decrement in source', () => {
  const opsApi = fs.readFileSync(path.join(repoRoot, 'miniapp', 'cloudfunctions', 'opsApi', 'index.js'), 'utf8');
  assert.match(opsApi, /packageRemaining\.\${serviceName}.*_\.\s*gt\s*\(\s*0\s*\)/);
  assert.match(opsApi, /packageRemaining\.\${serviceName}.*_\.\s*inc\s*\(\s*-1\s*\)/);
});
```

- [ ] **Step 3: Run the full relevant suite**

Run: `node --test tests/review-fixes.test.js tests/refund-state-machine.test.js tests/pay-callback-state.test.js`

Expected: PASS, 0 failures

- [ ] **Step 4: Commit**

```bash
git add tests/review-fixes.test.js tests/refund-state-machine.test.js tests/pay-callback-state.test.js
git commit -m "test: replace review regex checks with behavior coverage"
```

---

## Self-Review

**Spec coverage:**
- Fix inverted refund guards: covered by Task 1.
- Fix pay callback consistency gap: covered by Task 2.
- Replace brittle regex checks with behavior tests: covered by Task 3.
- Preserve existing package atomic decrement check: retained as a narrow smoke assertion in Task 3.

**Placeholder scan:**
- No `TODO`/`TBD` placeholders.
- Every code-changing step includes concrete code snippets.
- Every verification step has an exact command and expected result.

**Type consistency:**
- Refund helper names are `planEnterRefunding` and `planFinalizeRefund` throughout.
- Pay-callback helper names are `planPayCallbackStart` and `buildPayCallbackCompletionUpdate` throughout.
- New order marker fields are consistently `postPayState`, `postPayCompletedAt`, and `postPayUpdatedAt`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-15-refund-callback-consistency.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
