const { cloud, db, _cmd } = require('./context')
const { safeGetFirst, safeGetFirstByStore, safeGetById, safeList } = require('./data')
const {
  planEnterRefunding,
  planFinalizeRefund
} = require('./refund-state-machine')

function buildProductRollbackAdjustments(order, orderItems = []) {
  const adjustments = {}
  if (orderItems.length > 0) {
    orderItems.forEach(item => {
      if (!item || !item.productId) return
      adjustments[item.productId] = {
        productId: item.productId,
        quantity: (adjustments[item.productId]?.quantity || 0) + Number(item.quantity || 0)
      }
    })
    return adjustments
  }

  if (order && order.productId) {
    adjustments[order.productId] = {
      productId: order.productId,
      quantity: Number(order.quantity || 1)
    }
  }
  return adjustments
}

function buildCashbackRollbackAdjustments(records = []) {
  return records.reduce((acc, item) => {
    const inviterOpenid = item && item.inviterOpenid ? item.inviterOpenid : ''
    const cashbackAmount = Number(item && item.cashbackAmount ? item.cashbackAmount : 0)
    if (!inviterOpenid || cashbackAmount <= 0) return acc

    if (!acc.byInviter[inviterOpenid]) {
      acc.byInviter[inviterOpenid] = { cashbackAmount: 0, recordCount: 0 }
    }
    acc.byInviter[inviterOpenid].cashbackAmount += cashbackAmount
    acc.byInviter[inviterOpenid].recordCount += 1
    acc.totalCashback += cashbackAmount
    acc.recordCount += 1
    return acc
  }, {
    totalCashback: 0,
    recordCount: 0,
    byInviter: {}
  })
}

function randomToken(length = 12) {
  const seed = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let output = ''
  for (let i = 0; i < length; i += 1) {
    output += seed[Math.floor(Math.random() * seed.length)]
  }
  return output
}

function generateRefundNo() {
  return `RFD${Date.now()}${randomToken(8)}`
}

function hasCompletePayConfig(payConfig) {
  if (!payConfig || payConfig.enabled === false) return false
  return Boolean(payConfig.mchId && payConfig.apiV3Key && payConfig.certSerialNo && payConfig.privateKey && payConfig.certificatePem)
}

function toCurrencyAmount(value) {
  const amount = Number(value || 0)
  return Number.isFinite(amount) ? amount : NaN
}

function getPaidAmount(order) {
  return toCurrencyAmount(order && (order.payAmount || order.totalAmount || 0))
}

function isRefundFinalized(request, order) {
  return Boolean(
    (request && (request.status === 'refunded' || request.refundProcessedAt || request.refundId)) ||
    (order && (order.status === 'refunded' || order.refundedAt || order.refundProcessedAt || order.refundId))
  )
}

function hasAcceptedRefundResult(request) {
  return Boolean(
    request && (
      request.gatewayRefundAcceptedAt ||
      request.gatewayRefundId ||
      (request.gatewayResultCode === 'SUCCESS' && request.gatewayReturnCode === 'SUCCESS')
    )
  )
}

function buildAcceptedRefundResult(request = {}) {
  return {
    refundId: request.gatewayRefundId || request.refundId || '',
    resultCode: request.gatewayResultCode || request.refundResultCode || 'SUCCESS',
    returnCode: request.gatewayReturnCode || request.refundReturnCode || 'SUCCESS'
  }
}

async function resolveCashbackUserDocIds(cashbackAdjustments) {
  const inviterUserIds = {}
  for (const inviterOpenid of Object.keys(cashbackAdjustments.byInviter || {})) {
    const user = await safeGetFirst('users', { _openid: inviterOpenid })
    if (user && user._id) inviterUserIds[inviterOpenid] = user._id
  }
  return inviterUserIds
}

async function persistAcceptedRefundResult(requestId, outRefundNo, refundResult) {
  const now = db.serverDate()
  await db.collection('refund_requests').doc(requestId).update({
    data: {
      gatewayOutRefundNo: outRefundNo,
      gatewayRefundAcceptedAt: now,
      gatewayRefundId: refundResult.refundId || '',
      gatewayResultCode: refundResult.resultCode || '',
      gatewayReturnCode: refundResult.returnCode || '',
      updatedAt: now
    }
  })
}

async function rollbackRefundingState({ requestId, orderId, outRefundNo, reason }) {
  try {
    await db.runTransaction(async transaction => {
      const currentRequestRes = await transaction.collection('refund_requests').doc(requestId).get()
      const currentOrderRes = await transaction.collection('orders').doc(orderId).get()
      const currentRequest = currentRequestRes.data || null
      const currentOrder = currentOrderRes.data || null
      if (!currentRequest || !currentOrder) return
      if (isRefundFinalized(currentRequest, currentOrder) || hasAcceptedRefundResult(currentRequest)) return
      if (currentRequest.status !== 'refunding' || currentOrder.status !== 'refunding') return
      if (outRefundNo && currentRequest.outRefundNo && currentRequest.outRefundNo !== outRefundNo) return

      const now = db.serverDate()
      await transaction.collection('refund_requests').doc(requestId).update({
        data: {
          status: 'pending',
          outRefundNo: '',
          updatedAt: now,
          lastRefundError: reason || '',
          lastRefundFailedAt: now,
          gatewayOutRefundNo: '',
          gatewayRefundAcceptedAt: null,
          gatewayRefundId: '',
          gatewayResultCode: '',
          gatewayReturnCode: ''
        }
      })

      await transaction.collection('orders').doc(orderId).update({
        data: {
          status: 'refund_requested',
          updatedAt: now,
          refundNo: '',
          refundId: ''
        }
      })
    })
  } catch (error) {
    console.error('adminApi rollback refunding failed:', error)
  }
}

async function approveRefundRequest({ request, order, reviewerUid }) {
  const payConfig = await safeGetFirstByStore('pay_config', String(order && order.storeId || '').trim())
  if (!payConfig || !payConfig.mchId) {
    return { code: -1, msg: '支付商户号未配置，无法处理退款' }
  }
  if (!hasCompletePayConfig(payConfig)) {
    return { code: -1, msg: '支付配置不完整，请先在后台补充 API_V3_KEY、证书序列号、证书私钥和证书文件' }
  }

  const paidAmount = getPaidAmount(order)
  const refundAmount = toCurrencyAmount(request.refundAmount || paidAmount)
  if (!Number.isFinite(paidAmount) || paidAmount <= 0 || !Number.isFinite(refundAmount) || refundAmount <= 0) {
    return { code: -1, msg: '退款金额异常' }
  }
  if (refundAmount > paidAmount) {
    return { code: -1, msg: '退款金额不能超过实付金额' }
  }

  const orderItems = await safeList('order_items', { orderId: order._id }, { limit: 100 })
  const productAdjustments = buildProductRollbackAdjustments(order, orderItems)
  const products = await Promise.all(Object.keys(productAdjustments).map(productId => safeGetById('products', productId)))
  const productMap = products.filter(Boolean).reduce((acc, item) => {
    acc[item._id] = item
    return acc
  }, {})

  const refundableRecords = (await safeList('fission_records', {
    orderId: order._id
  }, { limit: 20 })).filter(item => item && item.status !== 'refunded')
  const cashbackAdjustments = buildCashbackRollbackAdjustments(refundableRecords)
  const inviterUserIds = await resolveCashbackUserDocIds(cashbackAdjustments)
  let outRefundNo = generateRefundNo()
  let refundStage = { mode: 'transition', outRefundNo, refundResult: null }

  try {
    await db.runTransaction(async transaction => {
      const currentRequestRes = await transaction.collection('refund_requests').doc(request._id).get()
      const currentOrderRes = await transaction.collection('orders').doc(order._id).get()
      const currentRequest = currentRequestRes.data || null
      const currentOrder = currentOrderRes.data || null
      if (isRefundFinalized(currentRequest, currentOrder)) {
        refundStage = {
          mode: 'already_finalized',
          outRefundNo: currentRequest && currentRequest.outRefundNo ? currentRequest.outRefundNo : (currentOrder && currentOrder.refundNo ? currentOrder.refundNo : outRefundNo),
          refundResult: buildAcceptedRefundResult(currentRequest || {})
        }
        return
      }

      const now = db.serverDate()
      const enterPlan = planEnterRefunding({
        request: currentRequest,
        order: currentOrder,
        reviewerOpenid: reviewerUid,
        generatedOutRefundNo: outRefundNo,
        now
      })

      outRefundNo = enterPlan.outRefundNo
      if (enterPlan.mode === 'resume') {
        refundStage = hasAcceptedRefundResult(currentRequest)
          ? {
              mode: 'resume_finalize',
              outRefundNo,
              refundResult: buildAcceptedRefundResult(currentRequest)
            }
          : {
              mode: 'resume_wait',
              outRefundNo,
              refundResult: null
            }
        return
      }

      refundStage = { mode: enterPlan.mode, outRefundNo, refundResult: null }

      if (enterPlan.requestUpdate) {
        await transaction.collection('refund_requests').doc(request._id).update({
          data: enterPlan.requestUpdate
        })
      }

      if (enterPlan.orderUpdate) {
        await transaction.collection('orders').doc(order._id).update({
          data: enterPlan.orderUpdate
        })
      }
    })
  } catch (error) {
    console.error('adminApi enter refunding failed:', error)
    return { code: -1, msg: error.message || '退款状态更新失败' }
  }

  if (refundStage.mode === 'already_finalized') {
    return { code: 0, msg: '退款已完成' }
  }

  if (refundStage.mode === 'resume_wait') {
    return { code: -1, msg: '退款处理中，请勿重复提交' }
  }

  let refundResult = refundStage.refundResult
  if (!refundResult) {
    try {
      refundResult = await cloud.cloudPay.refund({
        functionName: 'payApi',
        envId: cloud.DYNAMIC_CURRENT_ENV,
        subMchId: payConfig.mchId,
        nonceStr: randomToken(24),
        transactionId: order.paymentId || undefined,
        outTradeNo: order.orderNo,
        outRefundNo,
        totalFee: paidAmount,
        refundFee: refundAmount,
        refundDesc: request.reason || order.refundReason || '用户申请退款'
      })
    } catch (error) {
      await rollbackRefundingState({
        requestId: request._id,
        orderId: order._id,
        outRefundNo,
        reason: error.message || '发起退款失败'
      })
      console.error('adminApi refund failed:', error)
      return { code: -1, msg: error.message || '发起退款失败' }
    }

    if (refundResult.returnCode !== 'SUCCESS' || refundResult.resultCode !== 'SUCCESS') {
      await rollbackRefundingState({
        requestId: request._id,
        orderId: order._id,
        outRefundNo,
        reason: refundResult.errCodeDes || refundResult.returnMsg || '退款申请失败'
      })
      return {
        code: -1,
        msg: refundResult.errCodeDes || refundResult.returnMsg || '退款申请失败'
      }
    }

    try {
      await persistAcceptedRefundResult(request._id, outRefundNo, refundResult)
    } catch (error) {
      console.error('adminApi persist accepted refund failed:', error)
    }
  }

  let finalizeSkipped = false
  try {
    await db.runTransaction(async transaction => {
      const currentRequestRes = await transaction.collection('refund_requests').doc(request._id).get()
      const currentOrderRes = await transaction.collection('orders').doc(order._id).get()
      const currentRequest = currentRequestRes.data || null
      const currentOrder = currentOrderRes.data || null
      if (isRefundFinalized(currentRequest, currentOrder)) {
        finalizeSkipped = true
        return
      }

      const now = db.serverDate()
      const finalizePlan = planFinalizeRefund({
        request: currentRequest,
        order: currentOrder,
        reviewerOpenid: reviewerUid,
        outRefundNo,
        refundResult,
        now
      })

      await transaction.collection('refund_requests').doc(request._id).update({
        data: finalizePlan.requestUpdate
      })

      await transaction.collection('orders').doc(order._id).update({
        data: finalizePlan.orderUpdate
      })

      for (const productId of Object.keys(productAdjustments)) {
        const adjustment = productAdjustments[productId]
        const product = productMap[productId]
        if (!product || !adjustment) continue
        const data = {
          soldCount: _cmd.inc(-adjustment.quantity)
        }
        if (Number(product.stock) !== -1) {
          data.stock = _cmd.inc(adjustment.quantity)
        }
        await transaction.collection('products').doc(productId).update({ data })
      }

      const campaignUpdate = {}
      if (order.fissionCampaignId) {
        campaignUpdate.soldCount = _cmd.inc(-Number(order.quantity || 1))
      }
      if (cashbackAdjustments.totalCashback > 0) {
        campaignUpdate.newCustomers = _cmd.inc(-cashbackAdjustments.recordCount)
        campaignUpdate.totalCashback = _cmd.inc(-cashbackAdjustments.totalCashback)
      }
      if (order.fissionCampaignId && Object.keys(campaignUpdate).length > 0) {
        await transaction.collection('fission_campaigns').doc(order.fissionCampaignId).update({
          data: campaignUpdate
        })
      }

      for (const record of refundableRecords) {
        await transaction.collection('fission_records').doc(record._id).update({
          data: {
            status: 'refunded',
            refundedAt: now,
            refundRequestId: request._id
          }
        })
      }

      for (const inviterOpenid of Object.keys(cashbackAdjustments.byInviter)) {
        const adjustment = cashbackAdjustments.byInviter[inviterOpenid]
        const userDocId = inviterUserIds[inviterOpenid]
        if (!userDocId) continue
        await transaction.collection('users').doc(userDocId).update({
          data: {
            balance: _cmd.inc(-adjustment.cashbackAmount),
            totalEarned: _cmd.inc(-adjustment.cashbackAmount),
            totalInvited: _cmd.inc(-adjustment.recordCount),
            updatedAt: now
          }
        })
      }
    })
  } catch (error) {
    try {
      await persistAcceptedRefundResult(request._id, outRefundNo, refundResult)
    } catch (persistError) {
      console.error('adminApi persist accepted refund after finalize failure failed:', persistError)
    }
    console.error('adminApi save refund result failed:', error)
    return { code: -1, msg: error.message || '退款结果保存失败' }
  }

  if (finalizeSkipped) {
    return { code: 0, msg: '退款已完成' }
  }

  return { code: 0, msg: '退款已完成' }
}

module.exports = {
  approveRefundRequest
}
