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

test('refunding refund request resumes without rewriting state', () => {
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

test('finalize refund only accepts refunding to refunded', () => {
  const now = Symbol('now');
  const refundResult = {
    refundId: 'wx-refund-1',
    resultCode: 'SUCCESS',
    returnCode: 'SUCCESS'
  };

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

test('refund state machine exposes pending to refunding to refunded flow', () => {
  const now = Symbol('now');
  const refundResult = {
    refundId: 'wx-refund-2',
    resultCode: 'SUCCESS',
    returnCode: 'SUCCESS'
  };

  const enterPlan = planEnterRefunding({
    request: { _id: 'req-5', status: 'pending' },
    order: { _id: 'ord-5', status: 'refund_requested' },
    reviewerOpenid: 'staff-5',
    generatedOutRefundNo: 'RF202604150005',
    now
  });

  assert.equal(enterPlan.requestUpdate.status, 'refunding');
  assert.equal(enterPlan.orderUpdate.status, 'refunding');

  const finalizePlan = planFinalizeRefund({
    request: { _id: 'req-5', status: 'refunding' },
    order: { _id: 'ord-5', status: 'refunding' },
    reviewerOpenid: 'staff-5',
    outRefundNo: enterPlan.outRefundNo,
    refundResult,
    now
  });

  assert.equal(finalizePlan.requestUpdate.status, 'refunded');
  assert.equal(finalizePlan.orderUpdate.status, 'refunded');
  assert.equal(finalizePlan.requestUpdate.outRefundNo, 'RF202604150005');
  assert.equal(finalizePlan.orderUpdate.refundNo, 'RF202604150005');
});
