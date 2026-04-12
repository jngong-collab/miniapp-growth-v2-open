const { callCloud } = require('../../../utils/cloud-api')
const { ensureWorkbenchAccess } = require('../../../utils/workbench')
const { showToast } = require('../../../utils/util')

Page({
    data: {
        settings: {
            storeInfo: null,
            aiConfig: null,
            payConfig: null,
            staff: []
        }
    },

    onShow() {
        const access = ensureWorkbenchAccess(this, { requiredPermission: 'manageSettings' })
        if (!access) return
        this.loadSettings()
    },

    async loadSettings() {
        try {
            const settings = await callCloud('opsApi', { action: 'getWorkbenchSettings' })
            this.setData({ settings })
        } catch (error) {
            showToast(error.message || '设置加载失败')
        }
    },

    openStaffManage() {
        wx.navigateTo({ url: '/pages/workbench/staff/staff' })
    }
})
