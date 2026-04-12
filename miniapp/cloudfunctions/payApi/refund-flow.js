function buildRefundRequestPlan(reason, serverDateValue) {
    return {
        orderUpdate: {
            status: 'refunding',
            refundReason: reason || '',
            refundRequestedAt: serverDateValue
        },
        rollbackRelatedState: false
    }
}

module.exports = {
    buildRefundRequestPlan
}
