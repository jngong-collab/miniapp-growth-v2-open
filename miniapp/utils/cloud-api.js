function callCloud(name, data = {}) {
    return wx.cloud.callFunction({ name, data }).then(res => {
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
    const app = getApp()
    if (!app || typeof app !== 'object') {
        const error = new Error('客户端上下文异常')
        error.code = -500
        throw error
    }

    if (typeof app.isCustomerLoggedIn !== 'function') {
        return app
    }

    if (!app || !app.isCustomerLoggedIn || !app.isCustomerLoggedIn()) {
        const error = new Error('请先绑定手机号后再访问')
        error.code = -401
        throw error
    }
    return app
}

function callCloudWithLogin(name, data = {}) {
    getCustomerRequiredCloudClient()
    return callCloud(name, data)
}

module.exports = {
    callCloud,
    callCloudWithLogin
}
