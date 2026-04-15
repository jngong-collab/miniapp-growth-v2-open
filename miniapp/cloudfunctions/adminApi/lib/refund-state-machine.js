function planEnterRefunding({ request, order, reviewerOpenid, generatedOutRefundNo, now }) {
    if (!request || !order) throw new Error('退款申请或订单不存在')
    if (request.status === 'refunded' || order.status === 'refunded') {
        throw new Error('订单已退款')
    }

    if (request.status === 'pending') {
        if (order.status !== 'refund_requested') {
            throw new Error('订单状态异常，不能进入退款中')
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
        }
    }

    if (request.status === 'refunding' && order.status === 'refunding') {
        return {
            mode: 'resume',
            outRefundNo: request.outRefundNo || generatedOutRefundNo,
            requestUpdate: null,
            orderUpdate: null
        }
    }

    throw new Error('退款申请状态异常')
}

function planFinalizeRefund({ request, order, reviewerOpenid, outRefundNo, refundResult, now }) {
    if (!request || !order) throw new Error('退款申请或订单不存在')
    if (request.status !== 'refunding') throw new Error('退款申请状态异常')
    if (order.status !== 'refunding') throw new Error('订单状态异常')

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
    }
}

module.exports = {
    planEnterRefunding,
    planFinalizeRefund
}
