const { callCloud } = require('../../../utils/cloud-api')
const { ensureWorkbenchAccess } = require('../../../utils/workbench')
const { formatDate, fenToYuan, showToast } = require('../../../utils/util')

Page({
    data: {
        fissionCampaigns: [],
        lotteryCampaigns: []
    },

    onShow() {
        const access = ensureWorkbenchAccess(this, { requiredPermission: 'manageCampaigns' })
        if (!access) return
        this.loadCampaigns()
    },

    async loadCampaigns() {
        try {
            const data = await callCloud('opsApi', { action: 'getCampaignOverview' })
            this.setData({
                fissionCampaigns: (data.fissionCampaigns || []).map(item => ({
                    ...item,
                    activityPriceYuan: fenToYuan(item.activityPrice || 0),
                    periodText: `${formatDate(item.startTime, 'YYYY-MM-DD')} ~ ${formatDate(item.endTime, 'YYYY-MM-DD')}`
                })),
                lotteryCampaigns: (data.lotteryCampaigns || []).map(item => ({
                    ...item,
                    periodText: `${formatDate(item.startTime, 'YYYY-MM-DD')} ~ ${formatDate(item.endTime, 'YYYY-MM-DD')}`
                }))
            })
        } catch (error) {
            showToast(error.message || '活动数据加载失败')
        }
    }
})
