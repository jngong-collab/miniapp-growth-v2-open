const { callCloud } = require('../../../utils/cloud-api')
const { ensureWorkbenchAccess } = require('../../../utils/workbench')
const { fenToYuan, showToast } = require('../../../utils/util')

Page({
    data: {
        overview: {
            products: [],
            packages: []
        }
    },

    onShow() {
        const access = ensureWorkbenchAccess(this, { requiredPermission: 'manageProducts' })
        if (!access) return
        this.loadOverview()
    },

    async loadOverview() {
        try {
            const overview = await callCloud('opsApi', { action: 'getCatalogOverview' })
            this.setData({
                overview: {
                    products: (overview.products || []).map(item => ({
                        ...item,
                        priceYuan: fenToYuan(item.price || 0)
                    })),
                    packages: overview.packages || []
                }
            })
        } catch (error) {
            showToast(error.message || '商品数据加载失败')
        }
    }
})
