const { callCloud } = require('../../../utils/cloud-api')
const { ensureWorkbenchAccess } = require('../../../utils/workbench')
const { formatDate, showToast } = require('../../../utils/util')

const SOURCE_FILTERS = [
    { key: 'all', label: '全部' },
    { key: 'tongue', label: '舌象' },
    { key: 'lottery', label: '抽奖' },
    { key: 'order', label: '下单未到店' },
    { key: 'fission', label: '邀请裂变' }
]

Page({
    data: {
        sourceFilters: SOURCE_FILTERS,
        activeSource: 'all',
        leads: []
    },

    onShow() {
        const access = ensureWorkbenchAccess(this)
        if (!access) return
        this.loadLeads()
    },

    async loadLeads() {
        try {
            const leads = await callCloud('opsApi', {
                action: 'getLeadList',
                source: this.data.activeSource
            })
            this.setData({
                leads: (leads || []).map(lead => ({
                    ...lead,
                    updatedAtText: lead.lastActivityAt ? formatDate(lead.lastActivityAt) : '暂无最新动态'
                }))
            })
        } catch (error) {
            showToast(error.message || '线索加载失败')
        }
    },

    switchSource(e) {
        this.setData({ activeSource: e.currentTarget.dataset.source })
        this.loadLeads()
    },

    async updateFollowup(e) {
        const leadId = e.currentTarget.dataset.id
        const currentStatus = e.currentTarget.dataset.status || 'pending'
        try {
            const statusPick = await wx.showActionSheet({
                itemList: ['待跟进', '已联系', '已到店', '已成交']
            })
            const statuses = ['pending', 'contacted', 'visited', 'converted']
            const targetStatus = statuses[statusPick.tapIndex] || currentStatus
            const noteModal = await wx.showModal({
                title: '更新跟进备注',
                content: '记录本次沟通要点',
                editable: true,
                placeholderText: '例如：已加微信，约周五到店体验'
            })
            if (!noteModal.confirm) return
            await callCloud('opsApi', {
                action: 'upsertFollowup',
                leadOpenid: leadId,
                status: targetStatus,
                note: noteModal.content || ''
            })
            showToast('跟进已更新', 'success')
            this.loadLeads()
        } catch (error) {
            if (error && error.errMsg && error.errMsg.includes('cancel')) return
            showToast(error.message || '更新失败')
        }
    }
})
