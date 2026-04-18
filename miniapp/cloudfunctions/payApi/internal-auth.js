function getInternalSecret(env = process.env) {
    const raw = env && typeof env.PAY_CALLBACK_SECRET === 'string'
        ? env.PAY_CALLBACK_SECRET.trim()
        : ''
    return raw || null
}

function isAuthorizedInternalCall(event, env = process.env) {
    const secret = getInternalSecret(env)
    if (!secret) return false
    return !!event && event._internalSecret === secret
}

function normalizeString(value) {
    return typeof value === 'string' ? value.trim() : ''
}

function looksLikeOrderNo(value) {
    return /^ORD[A-Z0-9_-]{4,}$/i.test(value)
}

function looksLikeTransactionId(value) {
    return /^[A-Z0-9_-]{6,}$/i.test(value)
}

function normalizeFlatWxpayNotify(event) {
    if (!event || typeof event !== 'object') return null

    const orderNo = normalizeString(event.outTradeNo)
    const resultCode = normalizeString(event.resultCode).toUpperCase()
    const transactionId = normalizeString(event.transactionId)

    if (!orderNo || !looksLikeOrderNo(orderNo) || !resultCode) return null
    if (resultCode === 'SUCCESS' && !looksLikeTransactionId(transactionId)) return null

    return {
        orderNo,
        paymentId: transactionId,
        success: resultCode === 'SUCCESS',
        source: 'cloudpay-flat'
    }
}

function normalizeResourceWxpayNotify(event) {
    if (!event || typeof event !== 'object' || !event.resource || typeof event.resource !== 'object') {
        return null
    }

    const eventType = normalizeString(event.event_type).toUpperCase()
    const resource = event.resource
    const tradeState = normalizeString(resource.tradeState || resource.trade_state).toUpperCase()
    const orderNo = normalizeString(resource.outTradeNo || resource.out_trade_no)
    const transactionId = normalizeString(resource.transactionId || resource.transaction_id)

    if (eventType && eventType !== 'TRANSACTION.SUCCESS') return null
    if (tradeState && tradeState !== 'SUCCESS') return null
    if (!orderNo || !looksLikeOrderNo(orderNo) || !looksLikeTransactionId(transactionId)) return null

    return {
        orderNo,
        paymentId: transactionId,
        success: true,
        source: 'cloudpay-resource'
    }
}

function resolveTrustedWxpayNotify(event, wxContext, context, env = process.env) {
    const normalized = normalizeResourceWxpayNotify(event) || normalizeFlatWxpayNotify(event)
    if (!normalized) return null

    if (isAuthorizedInternalCall(event, env)) {
        return normalized
    }

    const callerOpenid = normalizeString(wxContext && wxContext.OPENID)
    if (callerOpenid) return null
    return normalized
}

module.exports = {
    getInternalSecret,
    isAuthorizedInternalCall,
    resolveTrustedWxpayNotify
}
