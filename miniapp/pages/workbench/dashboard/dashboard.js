const { callCloud } = require('../../../utils/cloud-api')
const { ensureWorkbenchAccess } = require('../../../utils/workbench')
const { showToast } = require('../../../utils/util')

const MODULES = [
    { key: 'orders', title: '订单与退款', desc: '查看订单、处理退款', url: '/pages/workbench/orders/orders', permission: 'viewOrders' },
    { key: 'verify', title: '核销中心', desc: '到店服务核销', url: '/pages/workbench/verify/verify', permission: 'verify' },
    { key: 'campaigns', title: '活动管理', desc: '裂变和抽奖活动', url: '/pages/workbench/campaigns/campaigns', permission: 'manageCampaigns' },
    { key: 'catalog', title: '商品与套餐', desc: '管理售卖内容', url: '/pages/workbench/catalog/catalog', permission: 'manageProducts' },
    { key: 'leads', title: '客户与跟进', desc: '查看线索与备注', url: '/pages/workbench/leads/leads', permission: 'viewLeads' },
    { key: 'settings', title: '门店设置', desc: '门店、AI、员工配置', url: '/pages/workbench/settings/settings', permission: 'manageSettings' }
]

Page({
    data: {
        role: 'customer',
        permissions: [],
        workbenchStaffName: '',
        loading: true,
        summary: {},
        summaryCards: [],
        modules: MODULES
    },

    onShow() {
        const access = ensureWorkbenchAccess(this)
        if (!access) return
        const permissionSet = new Set((access.permissions || []))
        const filteredModules = MODULES.filter(item => access.role === 'admin' || permissionSet.has(item.permission))
        this.setData({ modules: filteredModules })
        this.loadSummary()
    },

    async loadSummary() {
        this.setData({ loading: true })
        try {
            const summary = await callCloud('opsApi', { action: 'getWorkbenchSummary' })
            this.setData({
                summary,
                summaryCards: [
                    { label: '今日新增线索', value: summary.newLeads || 0 },
                    { label: '今日舌象参与', value: summary.tongueCount || 0 },
                    { label: '今日抽奖参与', value: summary.lotteryCount || 0 },
                    { label: '今日订单', value: summary.orderCount || 0 },
                    { label: '待核销', value: summary.pendingVerifyCount || 0 },
                    { label: '待处理退款', value: summary.pendingRefundCount || 0 },
                    { label: '裂变订单数', value: summary.fissionOrderCount || 0 },
                    { label: '7日转化率', value: summary.sevenDayConversionRateText || '0%' }
                ],
                loading: false
            })
        } catch (error) {
            this.setData({ loading: false })
            showToast(error.message || '工作台数据加载失败')
        }
    },

    openModule(e) {
        const url = e.currentTarget.dataset.url
        wx.navigateTo({ url })
    }
})
