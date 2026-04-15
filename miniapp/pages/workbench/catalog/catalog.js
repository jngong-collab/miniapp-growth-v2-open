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
                        priceYuan: fenToYuan(item.price || 0),
                        categoryLabel: item.category || (item.type === 'service' ? '到店服务' : item.type === 'package' ? '套餐模板' : '未分类'),
                        mallVisibilityLabel: item.showInMall ? '商城可见' : '仅活动/后台'
                    })),
                    packages: overview.packages || []
                }
            })
        } catch (error) {
            showToast(error.message || '商品数据加载失败')
        }
    }
})
