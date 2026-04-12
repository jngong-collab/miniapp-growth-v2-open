const PERM_OPTIONS = [
    { key: 'verify', label: '核销服务', icon: '🔑', desc: '核销中心使用权限' },
    { key: 'viewOrders', label: '查看订单', icon: '📋', desc: '查看门店所有订单' },
    { key: 'viewDashboard', label: '数据看板', icon: '📊', desc: '查看经营数据统计' },
    { key: 'manageProducts', label: '管理商品', icon: '🛒', desc: '上架、下架与编辑商品' },
    { key: 'manageCampaigns', label: '管理活动', icon: '🎯', desc: '创建、编辑裂变活动' },
    { key: 'manageSettings', label: '门店设置', icon: '⚙️', desc: '查看门店基础配置' },
    { key: 'manageStaff', label: '员工管理', icon: '👥', desc: '新增/编辑员工与权限' }
]
const { callCloud } = require('../../../utils/cloud-api')
const { ensureWorkbenchAccess } = require('../../../utils/workbench')

Page({
    data: {
        staffList: [],
        loading: true,
        permOptions: PERM_OPTIONS,
        showAddModal: false,
        newStaffOpenid: '',
        newStaffName: '',
        newStaffPhone: '',
        newStaffPerms: ['verify'],
        showEditModal: false,
        editingStaff: null,
        editingPerms: []
    },

    onLoad: function () {
        const access = ensureWorkbenchAccess(this, { requiredPermission: 'manageStaff' })
        if (!access) return
        this._loadStaff()
    },
    onShow: function () {
        const access = ensureWorkbenchAccess(this, { requiredPermission: 'manageStaff' })
        if (!access) return
        this._loadStaff()
    },

    async _loadStaff() {
        this.setData({ loading: true })
        try {
            const staffList = await callCloud('opsApi', { action: 'getStaffList' })
            const formatted = (staffList || []).map(s => ({
                ...s,
                permLabels: (s.permissions || []).map(p => {
                    const opt = PERM_OPTIONS.find(o => o.key === p)
                    return opt ? opt.label : p
                })
            }))
            this.setData({ staffList: formatted })
        } catch (e) {
            this.setData({ staffList: [] })
        } finally {
            this.setData({ loading: false })
        }
    },

    showAddStaff() {
        this.setData({
            showAddModal: true,
            newStaffOpenid: '',
            newStaffName: '',
            newStaffPhone: '',
            newStaffPerms: ['verify']
        })
    },

    closeAddModal() {
        this.setData({ showAddModal: false })
    },

    onNewNameInput: function (e) { this.setData({ newStaffName: e.detail.value }) },
    onNewPhoneInput: function (e) { this.setData({ newStaffPhone: e.detail.value }) },
    onNewOpenidInput: function (e) { this.setData({ newStaffOpenid: e.detail.value }) },

    toggleNewPerm: function (e) {
        const key = e.currentTarget.dataset.key
        const next = [...this.data.newStaffPerms]
        const idx = next.indexOf(key)
        if (idx >= 0) next.splice(idx, 1)
        else next.push(key)
        this.setData({ newStaffPerms: next })
    },

    async confirmAddStaff() {
        const { newStaffOpenid, newStaffName, newStaffPhone, newStaffPerms } = this.data
        if (!newStaffOpenid.trim()) {
            wx.showToast({ title: '请输入员工 openid', icon: 'none' })
            return
        }

        wx.showLoading({ title: '添加中...', mask: true })
        try {
            const res = await callCloud('opsApi', {
                action: 'addStaff',
                staffOpenid: newStaffOpenid.trim(),
                staffName: newStaffName.trim() || '员工',
                staffPhone: newStaffPhone.trim(),
                permissions: newStaffPerms
            })
            wx.hideLoading()
            if (res) {
                wx.showToast({ title: '添加成功', icon: 'success' })
                this.setData({ showAddModal: false })
                this._loadStaff()
            } else {
                wx.showToast({ title: '添加失败', icon: 'none' })
            }
        } catch (e) {
            wx.hideLoading()
            wx.showToast({ title: e.message || '网络异常', icon: 'none' })
        }
    },

    editStaff: function (e) {
        const staff = e.currentTarget.dataset.staff
        this.setData({
            showEditModal: true,
            editingStaff: staff,
            editingPerms: [...(staff.permissions || [])]
        })
    },

    closeEditModal() {
        this.setData({ showEditModal: false, editingStaff: null })
    },

    toggleEditPerm: function (e) {
        const key = e.currentTarget.dataset.key
        const next = [...this.data.editingPerms]
        const idx = next.indexOf(key)
        if (idx >= 0) next.splice(idx, 1)
        else next.push(key)
        this.setData({ editingPerms: next })
    },

    async confirmEditPerms() {
        const { editingStaff, editingPerms } = this.data
        if (!editingStaff) return

        wx.showLoading({ title: '保存中...', mask: true })
        try {
            const res = await callCloud('opsApi', {
                action: 'updateStaffPermissions',
                staffOpenid: editingStaff.openid,
                permissions: editingPerms
            })
            wx.hideLoading()
            if (res) {
                wx.showToast({ title: '权限已更新', icon: 'success' })
                this.setData({ showEditModal: false })
                this._loadStaff()
            } else {
                wx.showToast({ title: '更新失败', icon: 'none' })
            }
        } catch (e) {
            wx.hideLoading()
            wx.showToast({ title: e.message || '网络异常', icon: 'none' })
        }
    },

    removeStaff: function (e) {
        const staff = e.currentTarget.dataset.staff
        wx.showModal({
            title: '确认移除',
            content: `确定要移除员工「${staff.name}」吗？移除后该员工将无法使用管理功能。`,
            success: async res => {
                if (!res.confirm) return
                wx.showLoading({ title: '处理中...', mask: true })
                try {
                    const result = await callCloud('opsApi', {
                        action: 'removeStaff',
                        staffOpenid: staff.openid
                    })
                    wx.hideLoading()
                    if (result) {
                        wx.showToast({ title: '已移除', icon: 'success' })
                        this._loadStaff()
                    } else {
                        wx.showToast({ title: '操作失败', icon: 'none' })
                    }
                } catch (e) {
                    wx.hideLoading()
                    wx.showToast({ title: e.message || '网络异常', icon: 'none' })
                }
            }
        })
    }
})
