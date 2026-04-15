function buildRefundRequestPlan(payload = {}, serverDateValue) {
    const {
        orderId = '',
        orderNo = '',
        requesterOpenid = '',
        previousStatus = 'paid',
        refundAmount = 0,
        reason = ''
    } = payload

    return {
        orderUpdate: {
            status: 'refund_requested',
            refundReason: reason || '',
            refundRequestedAt: serverDateValue,
            updatedAt: serverDateValue
        },
        refundRequestData: {
            orderId,
            orderNo,
            requesterOpenid,
            reason: reason || '',
            status: 'pending',
            previousStatus,
            refundAmount: Number(refundAmount || 0),
            createdAt: serverDateValue,
            updatedAt: serverDateValue
        }
    }
}

module.exports = {
    buildRefundRequestPlan
}
