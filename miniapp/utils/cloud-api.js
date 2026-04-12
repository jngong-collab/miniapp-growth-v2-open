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

module.exports = {
    callCloud
}
