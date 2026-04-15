const { callCloud } = require('../../utils/cloud-api')
const { formatDate, fenToYuan, showToast } = require('../../utils/util')

const FILTERS = [
    { key: 'all', label: '全部' },
    { key: 'pending', label: '待支付' },
    { key: 'paid', label: '已支付' },
    { key: 'refund', label: '退款中' },
    { key: 'completed', label: '已完成' }
]

Page({
    data: {
        filters: FILTERS,
        activeStatus: 'all',
        loading: true,
        orders: []
    },

    onLoad(options) {
        this.setData({
            activeStatus: normalizeOrderFilter(options.status)
        })
    },

    onShow() {
        this.loadOrders()
    },

    async loadOrders() {
        this.setData({ loading: true })
        try {
            const orders = await callCloud('commerceApi', {
                action: 'getMyOrders',
                status: this.data.activeStatus
            })

            this.setData({
                orders: (orders || []).map(formatOrder),
                loading: false
            })
        } catch (error) {
            this.setData({ loading: false })
            showToast(error.message || '订单加载失败')
        }
    },

    switchStatus(e) {
        const status = e.currentTarget.dataset.status
        if (status === this.data.activeStatus) return
        this.setData({ activeStatus: status })
        this.loadOrders()
    },

    async requestRefund(e) {
        const orderId = e.currentTarget.dataset.id
        try {
            const modal = await wx.showModal({
                title: '申请退款',
                content: '退款申请会提交给门店审核，确认继续吗？',
                editable: true,
                placeholderText: '可填写退款原因'
            })

            if (!modal.confirm) return

            await callCloud('commerceApi', {
                action: 'requestRefund',
                orderId,
                reason: modal.content || ''
            })

            showToast('退款申请已提交', 'success')
            this.loadOrders()
        } catch (error) {
            if (error && error.errMsg && error.errMsg.includes('cancel')) return
            showToast(error.message || '退款申请失败')
        }
    },

    async payOrder(e) {
        const orderId = e.currentTarget.dataset.id
        if (!orderId) return

        try {
            wx.showLoading({ title: '拉起支付...', mask: true })
            let payRes
            try {
                payRes = await callCloud('commerceApi', {
                    action: 'requestPay',
                    orderId
                })
            } catch (error) {
                wx.hideLoading()
                if (error.code === -2) {
                    wx.showModal({
                        title: '支付功能待配置',
                        content: '请在云开发控制台开通"云支付"功能并绑定商户号后再使用',
                        showCancel: false
                    })
                    return
                }
                throw error
            }

            wx.hideLoading()
            const { payment } = payRes
            await wx.requestPayment({
                timeStamp: payment.timeStamp,
                nonceStr: payment.nonceStr,
                package: payment.package,
                signType: payment.signType,
                paySign: payment.paySign
            })
            showToast('支付成功', 'success')
            this.loadOrders()
        } catch (error) {
            wx.hideLoading()
            if (error && error.errMsg && error.errMsg.includes('cancel')) {
                showToast('已取消支付')
                return
            }
            showToast(error.message || '支付失败，请重试')
        }
    }
})

function formatOrder(order) {
    const items = (order.items || []).map(item => ({
        ...item,
        subtotalYuan: fenToYuan(item.subtotal || 0),
        priceYuan: fenToYuan(item.price || 0, 1)
    }))

    return {
        ...order,
        items,
        payAmountYuan: fenToYuan(order.payAmount || order.totalAmount || 0),
        createdAtText: formatDate(order.createdAt),
        displayProductName: order.productName || (items[0] && items[0].productName) || '门店订单',
        statusLabel: getStatusLabel(order.status),
        itemCount: order.itemCount || items.length || 1,
        canRefund: order.status === 'paid',
        canPay: order.status === 'pending'
    }
}

function getStatusLabel(status) {
    const statusMap = {
        pending: '待支付',
        paid: '已支付',
        refund_requested: '退款申请中',
        refunding: '退款处理中',
        refunded: '已退款',
        cancelled: '已取消',
        completed: '已完成'
    }
    return statusMap[status] || status || '未知状态'
}

function normalizeOrderFilter(status) {
    if (status === 'refund_requested' || status === 'refunding' || status === 'refunded') {
        return 'refund'
    }
    return status || 'all'
}
