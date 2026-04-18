// pages/package-usage/package-usage.js
const { enrichPackageItemState } = require('../../utils/package-state')
const { callCloudWithLogin } = require('../../utils/cloud-api')

Page({
    data: {
        activeTab: 'list',
        packages: [],
        selectedPackage: null,
        loading: true,
        // 核销服务选择
        showServicePicker: false,
        selectedService: ''
    },

    onLoad: function () { /* 首次由 onShow 触发 */ },
    onShow: function () {
        const app = getApp()
        if (!app.requireCustomerLogin('/pages/package-usage/package-usage')) {
            return
        }
        this._loadPackages()
    },
    onUnload: function () {
        if (this._qrTimer) clearTimeout(this._qrTimer)
    },

    _findPackageById: function (packageId) {
        return (this.data.packages || []).find(item => item._id === packageId) || null
    },

    _loadPackages: async function () {
        const app = getApp()
        if (!app.requireCustomerLogin('/pages/package-usage/package-usage')) {
            return
        }
        this.setData({ loading: true })
        try {
            const items = await callCloudWithLogin('growthApi', { action: 'getMyPackages' })
            const packages = (items || []).map(enrichPackageItemState)
            this.setData({ packages, loading: false })

            // 如果当前选中的套餐已更新，同步更新
            if (this.data.selectedPackage) {
                const updated = packages.find(p => p._id === this.data.selectedPackage._id)
                if (updated) {
                    this.setData({ selectedPackage: updated })
                }
            }
        } catch (e) {
            console.error('加载套餐失败:', e)
            this.setData({ loading: false })
            wx.showToast({ title: '套餐加载失败', icon: 'none' })
        }
    },

    switchTab: function (e) {
        this.setData({ activeTab: e.currentTarget.dataset.tab })
    },

    switchToList: function () {
        this.setData({ activeTab: 'list' })
    },

    selectPackage: function (e) {
        const item = this._findPackageById(e.currentTarget.dataset.id)
        if (!item) return
        this.setData({ selectedPackage: item, activeTab: 'qr' })
        // 延迟绘制二维码
        this._qrTimer = setTimeout(() => this._drawQrCode(item.verifyCode), 100)
    },

    showQrCode: function (e) {
        const item = this._findPackageById(e.currentTarget.dataset.id)
        if (!item) return
        this.setData({ selectedPackage: item, activeTab: 'qr' })
        this._qrTimer = setTimeout(() => this._drawQrCode(item.verifyCode), 100)
    },

    // 绘制核销码（大号数字 + 条形码样式）
    _drawQrCode: function (code) {
        if (!code) return
        const ctx = wx.createCanvasContext('verifyCanvas', this)
        const w = 300, h = 300

        // 白色背景
        ctx.setFillStyle('#FFFFFF')
        ctx.fillRect(0, 0, w, h)

        // 绘制条形码样式
        const barY = 40, barH = 140
        const codeStr = String(code)
        const totalBars = codeStr.length * 8
        const barWidth = (w - 60) / totalBars
        let x = 30

        for (let i = 0; i < codeStr.length; i++) {
            const charCode = codeStr.charCodeAt(i)
            for (let bit = 7; bit >= 0; bit--) {
                const isBlack = (charCode >> bit) & 1
                ctx.setFillStyle(isBlack ? '#000000' : '#FFFFFF')
                ctx.fillRect(x, barY, barWidth, barH)
                x += barWidth
            }
        }

        // 开始和结束标记线
        ctx.setFillStyle('#000000')
        ctx.fillRect(20, barY, 6, barH)
        ctx.fillRect(w - 26, barY, 6, barH)

        // 核销码文字
        ctx.setFontSize(36)
        ctx.setFillStyle('#333333')
        ctx.setTextAlign('center')
        ctx.fillText(codeStr, w / 2, barY + barH + 50)

        // 底部提示
        ctx.setFontSize(14)
        ctx.setFillStyle('#999999')
        ctx.fillText('请向工作人员出示此码', w / 2, barY + barH + 80)

        ctx.draw()
    },

    // ---- 服务选择相关 ----

    // 打开服务选择弹窗（用于告知店员核销哪个服务）
    openServicePicker: function () {
        const pkg = this.data.selectedPackage
        if (!pkg || !pkg.remainingItems) return
        // 过滤出还有剩余次数的服务
        const available = pkg.remainingItems.filter(ri => ri.remaining > 0)
        if (available.length === 0) {
            wx.showToast({ title: '所有服务已核销完毕', icon: 'none' })
            return
        }
        this.setData({ showServicePicker: true })
    },

    closeServicePicker: function () {
        this.setData({ showServicePicker: false })
    },

    selectService: function (e) {
        if (Number(e.currentTarget.dataset.remaining) <= 0) return
        const serviceName = e.currentTarget.dataset.name
        this.setData({ selectedService: serviceName, showServicePicker: false })
        wx.showToast({ title: `已选择：${serviceName}`, icon: 'none' })
    },

    goToMall: function () {
        wx.switchTab({ url: '/pages/mall/mall' })
    }
})
