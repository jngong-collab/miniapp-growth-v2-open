const { callCloud } = require('../../utils/cloud-api')
const { formatDate, fenToYuan, showToast } = require('../../utils/util')

const FILTERS = [
    { key: 'all', label: '全部' },
    { key: 'pending', label: '待支付' },
    { key: 'paid', label: '已支付' },
    { key: 'refund_requested', label: '退款中' },
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
            activeStatus: options.status || 'all'
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
    }
})

function formatOrder(order) {
    return {
        ...order,
        payAmountYuan: fenToYuan(order.payAmount || order.totalAmount || 0),
        createdAtText: formatDate(order.createdAt),
        statusLabel: getStatusLabel(order.status),
        canRefund: order.status === 'paid'
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
