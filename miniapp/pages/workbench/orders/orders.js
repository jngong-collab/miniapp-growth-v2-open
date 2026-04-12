const { callCloud } = require('../../../utils/cloud-api')
const { ensureWorkbenchAccess } = require('../../../utils/workbench')
const { formatDate, fenToYuan, showToast } = require('../../../utils/util')

const FILTERS = [
    { key: 'all', label: '全部' },
    { key: 'pending', label: '待支付' },
    { key: 'paid', label: '已支付' },
    { key: 'refund_requested', label: '退款申请中' },
    { key: 'refunding', label: '退款处理中' }
]

Page({
    data: {
        filters: FILTERS,
        activeStatus: 'all',
        loading: true,
        orders: [],
        role: 'customer',
        permissions: []
    },

    onShow() {
        const access = ensureWorkbenchAccess(this, { requiredPermission: 'viewOrders' })
        if (!access) return
        this.loadOrders()
    },

    async loadOrders() {
        this.setData({ loading: true })
        try {
            const orders = await callCloud('opsApi', {
                action: 'getWorkbenchOrders',
                status: this.data.activeStatus
            })
            this.setData({
                orders: (orders || []).map(order => ({
                    ...order,
                    totalAmountYuan: fenToYuan(order.totalAmount || order.payAmount || 0),
                    createdAtText: formatDate(order.createdAt)
                })),
                loading: false
            })
        } catch (error) {
            this.setData({ loading: false })
            showToast(error.message || '订单数据加载失败')
        }
    },

    switchStatus(e) {
        const status = e.currentTarget.dataset.status
        this.setData({ activeStatus: status })
        this.loadOrders()
    },

    async processRefund(e) {
        const requestId = e.currentTarget.dataset.requestId
        const orderId = e.currentTarget.dataset.orderId
        const itemList = ['同意退款', '驳回申请']
        try {
            const pick = await wx.showActionSheet({ itemList })
            const targetStatus = pick.tapIndex === 0 ? 'approved' : 'rejected'
            await callCloud('opsApi', {
                action: 'updateRefundRequest',
                requestId,
                orderId,
                status: targetStatus
            })
            showToast('退款状态已更新', 'success')
            this.loadOrders()
        } catch (error) {
            if (error && error.errMsg && error.errMsg.includes('cancel')) return
            showToast(error.message || '处理失败')
        }
    }
})
