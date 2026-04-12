const { ensureWorkbenchAccess } = require('../../../utils/workbench')
const { callCloud } = require('../../../utils/cloud-api')

Page({
    data: {
        verifyCode: '',
        serviceName: '',
        result: null,
        orderItem: null,
        loading: false,
        serviceList: [],
        showServicePicker: false
    },

    onLoad: function () {
        ensureWorkbenchAccess(this, { requiredPermission: 'verify' })
    },

    onCodeInput: function (e) {
        this.setData({ verifyCode: e.detail.value, result: null, orderItem: null, serviceList: [] })
    },

    async queryCode() {
        const code = this.data.verifyCode.trim()
        if (!code || code.length < 6) {
            wx.showToast({ title: '请输入有效核销码', icon: 'none' })
            return
        }

        this.setData({ loading: true, result: null })
        try {
            const res = await callCloud('opsApi', {
                action: 'queryVerifyCode',
                verifyCode: code
            })
            if (res) {
                let serviceList = []
                if (res.productType === 'package' && res.packageItems) {
                    const remaining = res.packageRemaining || {}
                    serviceList = res.packageItems
                        .map((pi) => ({
                            name: pi.name,
                            total: pi.count,
                            remaining: remaining[pi.name] ?? pi.count
                        }))
                        .filter(s => s.remaining > 0)
                }
                this.setData({ orderItem: res, serviceList, result: null })
            } else {
                this.setData({ result: { success: false, msg: '核销码无效' } })
            }
        } catch (e) {
            this.setData({ result: { success: false, msg: e.message || '查询失败' } })
        } finally {
            this.setData({ loading: false })
        }
    },

    selectService: function (e) {
        this.setData({ serviceName: e.currentTarget.dataset.name })
    },

    async doVerify() {
        const { verifyCode, serviceName, orderItem } = this.data
        if (!orderItem) return

        if (orderItem.productType === 'package' && !serviceName) {
            wx.showToast({ title: '请先选择要核销的服务', icon: 'none' })
            return
        }

        const confirm = await new Promise(resolve => {
            wx.showModal({
                title: '确认核销',
                content: orderItem.productType === 'package'
                    ? `确认为「${orderItem.productName}」核销「${serviceName}」？`
                    : `确认核销「${orderItem.productName}」？`,
                success: res => resolve(res.confirm)
            })
        })
        if (!confirm) return

        this.setData({ loading: true })
        try {
            const res = await callCloud('opsApi', {
                action: 'verifyPackage',
                verifyCode: verifyCode.trim(),
                serviceName: serviceName || orderItem.productName
            })
            if (res) {
                this.setData({
                    result: { success: true, msg: '核销成功！' },
                    orderItem: null,
                    serviceList: [],
                    serviceName: '',
                    verifyCode: ''
                })
                wx.showToast({ title: '✅ 核销成功', icon: 'none', duration: 2000 })
            } else {
                this.setData({ result: { success: false, msg: '核销失败' } })
            }
        } catch (e) {
            this.setData({ result: { success: false, msg: e.message || '网络异常' } })
        } finally {
            this.setData({ loading: false })
        }
    },

    resetForm() {
        this.setData({
            verifyCode: '',
            serviceName: '',
            result: null,
            orderItem: null,
            serviceList: []
        })
    }
})
