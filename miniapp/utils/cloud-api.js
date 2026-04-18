function resolveApp() {
    if (typeof getApp !== 'function') return null
    try {
        return getApp()
    } catch (error) {
        return null
    }
}

function buildRequestData(data = {}, { requireLogin = false } = {}) {
    const app = resolveApp()
    const payload = { ...(data || {}) }
    if (app && typeof app.getCustomerSessionToken === 'function') {
        const sessionToken = app.getCustomerSessionToken()
        if (sessionToken && !payload.sessionToken) {
            payload.sessionToken = sessionToken
        }
    }

    if (requireLogin) {
        getCustomerRequiredCloudClient()
        if (!payload.sessionToken) {
            const error = new Error('请先绑定手机号后再访问')
            error.code = -401
            throw error
        }
    }

    return payload
}

function callCloud(name, data = {}) {
    const requestData = buildRequestData(data)
    return wx.cloud.callFunction({ name, data: requestData }).then(res => {
        const result = res.result || {}
        if (result.code !== 0) {
            const error = new Error(result.msg || '请求失败')
            error.code = result.code
            error.result = result
            throw error
        }
        return result.data
    })
}

function getCustomerRequiredCloudClient() {
    const app = resolveApp()
    if (!app || typeof app !== 'object') {
        const error = new Error('客户端上下文异常')
        error.code = -500
        throw error
    }

    if (typeof app.isCustomerLoggedIn !== 'function' || !app.isCustomerLoggedIn()) {
        const error = new Error('请先绑定手机号后再访问')
        error.code = -401
        throw error
    }
    return app
}

function callCloudWithLogin(name, data = {}) {
    const requestData = buildRequestData(data, { requireLogin: true })
    return wx.cloud.callFunction({ name, data: requestData }).then(res => {
        const result = res.result || {}
        if (result.code !== 0) {
            const error = new Error(result.msg || '请求失败')
            error.code = result.code
            error.result = result
            throw error
        }
        return result.data
    })
}

module.exports = {
    callCloud,
    callCloudWithLogin
}
