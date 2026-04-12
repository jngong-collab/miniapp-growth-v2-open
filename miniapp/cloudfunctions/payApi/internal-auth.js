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

module.exports = {
    getInternalSecret,
    isAuthorizedInternalCall
}
