const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const {
    planEnterRefunding,
    planFinalizeRefund
} = require('./refund-state-machine')

const ADMIN_PERMISSIONS = [
    'verify',
    'viewOrders',
    'viewDashboard',
    'manageProducts',
    'manageCampaigns',
    'viewLeads',
    'manageSettings',
    'manageStaff',
    'manageRefunds'
]

const STAFF_DEFAULT_PERMISSIONS = [
    'verify',
    'viewOrders',
    'viewDashboard',
    'viewLeads'
]

const STAFF_PERMISSION_WHITELIST = Array.from(new Set(ADMIN_PERMISSIONS))

exports.main = async (event) => {
    const { OPENID } = cloud.getWXContext()
    const { action } = event

    switch (action) {
        case 'ensureUser':
            return ensureUser(OPENID, event)
        case 'login':
        case 'initUser':
            return ensureUser(OPENID, event)
        case '':
            return ensureUser(OPENID, event)
        case 'getStoreInfo':
            return getStoreInfo(OPENID)
        case 'getWorkbenchAccess':
            return getWorkbenchAccess(OPENID)
        case 'getWorkbenchSummary':
            return getWorkbenchSummary(OPENID)
        case 'getWorkbenchOrders':
            return getWorkbenchOrders(event, OPENID)
        case 'getLeadList':
            return getLeadList(event, OPENID)
        case 'upsertFollowup':
            return upsertFollowup(event, OPENID)
        case 'getWorkbenchSettings':
            return getWorkbenchSettings(OPENID)
        case 'getCatalogOverview':
            return getCatalogOverview(OPENID)
        case 'getCampaignOverview':
            return getCampaignOverview(OPENID)
        case 'updateRefundRequest':
            return updateRefundRequest(event, OPENID)
        case 'getStaffList':
            return getStaffList(OPENID)
        case 'addStaff':
            return addStaff(event, OPENID)
        case 'updateStaffPermissions':
            return updateStaffPermissions(event, OPENID)
        case 'removeStaff':
            return removeStaff(event, OPENID)
        case 'queryVerifyCode':
            return queryVerifyCode(event, OPENID)
        case 'verifyPackage':
            return verifyPackage(event, OPENID)
        default:
            return { code: -1, msg: '未知操作' }
    }
}

async function ensureUser(openid, event) {
    if (!openid) return { code: -1, msg: '缺少用户身份' }

    const invitedBy = (event || {}).invitedBy || ''

    let user = await safeGetFirst('users', { _openid: openid })
    const storeId = await resolveUserStoreId({
        openid,
        invitedBy,
        currentUser: user
    })
    if (!user) {
        const payload = {
            _openid: openid,
            nickName: '',
            avatarUrl: '',
            phone: '',
            role: 'customer',
            permissions: [],
            storeId,
            inviterOpenid: invitedBy && invitedBy !== openid ? invitedBy : '',
            leadSources: [],
            balance: 0,
            totalEarned: 0,
            totalInvited: 0,
            memberLevel: 'normal',
            createdAt: db.serverDate(),
            updatedAt: db.serverDate()
        }
        const addRes = await db.collection('users').add({ data: payload })
        if (!addRes._id) return { code: -1, msg: '用户初始化失败' }
        user = await safeGetFirst('users', { _openid: openid })
    }

    if (invitedBy && invitedBy !== openid && !user.inviterOpenid) {
        await db.collection('users').where({ _openid: openid }).update({
            data: {
                inviterOpenid: invitedBy,
                updatedAt: db.serverDate()
            }
        })
        user.inviterOpenid = invitedBy
    }

    return { code: 0, openid, data: user }
}

async function getStoreInfo(openid) {
    const storeId = await resolveUserStoreId({ openid })
    if (!storeId) return { code: 0, data: null }
    const storeRes = await safeGetFirst('stores', { _id: storeId })
    if (!storeRes) return { code: 0, data: null }
    return { code: 0, data: sanitizeStore(storeRes) }
}

async function getStaffList(openid) {
    const access = await requireWorkbench(openid, 'manageStaff')
    if (access.code) return access

    const storeRes = await safeGetFirst('stores', { adminOpenids: openid })
    if (!storeRes) return { code: -1, msg: '门店不存在' }
    return { code: 0, data: storeRes.staff || [] }
}

async function addStaff(event, openid) {
    const access = await requireWorkbench(openid, 'manageStaff')
    if (access.code) return access

    const { staffOpenid, staffName, staffPhone, permissions } = event
    if (!staffOpenid) return { code: -1, msg: '缺少员工 openid' }

    const storeRes = await safeGetFirst('stores', { adminOpenids: openid })
    if (!storeRes) return { code: -1, msg: '门店不存在' }

    const staffList = storeRes.staff || []
    if (staffList.find(item => item.openid === staffOpenid)) return { code: -1, msg: '该员工已存在' }
    if ((storeRes.adminOpenids || []).includes(staffOpenid)) return { code: -1, msg: '管理员无需添加为员工' }

    const newStaff = {
        openid: staffOpenid,
        name: staffName || '员工',
        phone: staffPhone || '',
        permissions: mergePermissions(permissions || STAFF_DEFAULT_PERMISSIONS).filter(Boolean),
        addedAt: db.serverDate()
    }

    await db.collection('stores').doc(storeRes._id).update({
        data: { staff: _.push(newStaff) }
    })
    return { code: 0, msg: '添加成功', data: newStaff }
}

async function updateStaffPermissions(event, openid) {
    const access = await requireWorkbench(openid, 'manageStaff')
    if (access.code) return access

    const { staffOpenid: targetOpenid, permissions } = event
    if (!targetOpenid || !Array.isArray(permissions)) return { code: -1, msg: '参数错误' }

    const storeRes = await safeGetFirst('stores', { adminOpenids: openid })
    if (!storeRes) return { code: -1, msg: '门店不存在' }

    const staffList = storeRes.staff || []
    const idx = staffList.findIndex(item => item.openid === targetOpenid)
    if (idx < 0) return { code: -1, msg: '员工不存在' }

    staffList[idx].permissions = mergePermissions(permissions)
    await db.collection('stores').doc(storeRes._id).update({
        data: { staff: staffList }
    })

    return { code: 0, msg: '权限更新成功' }
}

async function removeStaff(event, openid) {
    const access = await requireWorkbench(openid, 'manageStaff')
    if (access.code) return access

    const { staffOpenid } = event
    if (!staffOpenid) return { code: -1, msg: '缺少员工 openid' }

    const storeRes = await safeGetFirst('stores', { adminOpenids: openid })
    if (!storeRes) return { code: -1, msg: '门店不存在' }

    await db.collection('stores').doc(storeRes._id).update({
        data: {
            staff: (storeRes.staff || []).filter(item => item.openid !== staffOpenid)
        }
    })
    return { code: 0, msg: '已移除员工' }
}

async function queryVerifyCode(event, openid) {
    const access = await requireWorkbench(openid, 'verify')
    if (access.code) return access

    const { verifyCode } = event
    if (!verifyCode) return { code: -1, msg: '缺少核销码' }

    const itemRes = await safeList('order_items', {
        verifyCode,
        productType: _.in(['service', 'package'])
    }, { limit: 1 })
    if (!itemRes.length) return { code: -1, msg: '核销码无效' }

    const item = itemRes[0]
    let order
    try {
        order = await safeGetById('orders', item.orderId)
    } catch (error) {
        order = null
    }
    if (!order) return { code: -1, msg: '订单不存在' }
    if (order.status !== 'paid') return { code: -1, msg: '订单未支付' }
    const storeGuard = ensureStoreOwnership(access.storeId, [item.storeId, order.storeId], '无权限核销该订单')
    if (storeGuard) return storeGuard

    const { _openid, ...safeItem } = item
    return { code: 0, data: safeItem }
}

async function verifyPackage(event, openid) {
    const access = await requireWorkbench(openid, 'verify')
    if (access.code) return access

    const { verifyCode, serviceName } = event
    if (!verifyCode) return { code: -1, msg: '缺少核销码' }

    const itemRes = await safeList('order_items', {
        verifyCode,
        productType: _.in(['service', 'package'])
    }, { limit: 1 })
    if (!itemRes.length) return { code: -1, msg: '核销码无效' }

    const item = itemRes[0]
    let order
    try {
        order = await safeGetById('orders', item.orderId)
    } catch (error) {
        order = null
    }
    if (!order) return { code: -1, msg: '订单不存在' }
    if (order.status !== 'paid') return { code: -1, msg: '订单未支付' }
    const storeGuard = ensureStoreOwnership(access.storeId, [item.storeId, order.storeId], '无权限核销该订单')
    if (storeGuard) return storeGuard

    if (item.productType === 'package') {
        if (!serviceName) return { code: -1, msg: '请指定要核销的服务项目' }
        if (item.packageExpireAt && new Date(item.packageExpireAt) < new Date()) {
            return { code: -1, msg: '该套餐已过期' }
        }
        const updateRes = await db.collection('order_items').where({
            _id: item._id,
            [`packageRemaining.${serviceName}`]: _.gt(0)
        }).update({
            data: { [`packageRemaining.${serviceName}`]: _.inc(-1) }
        })
        if (updateRes.stats.updated === 0) {
            return { code: -1, msg: `「${serviceName}」已无剩余次数` }
        }
    } else {
        const remaining = item.packageRemaining || {}
        if (remaining.used) return { code: -1, msg: '该服务已核销，不可重复核销' }
        await db.collection('order_items').doc(item._id).update({
            data: {
                packageRemaining: { used: true, usedAt: db.serverDate() }
            }
        })
    }

    await db.collection('package_usage').add({
        data: {
            _openid: item._openid,
            orderItemId: item._id,
            serviceName: serviceName || item.productName,
            operatorOpenid: openid,
            remark: '',
            createdAt: db.serverDate()
        }
    })

    return {
        code: 0,
        msg: '核销成功',
        data: { serviceName: serviceName || item.productName }
    }
}

async function getWorkbenchAccess(openid) {
    const storeRes = await safeGetFirst('stores', { adminOpenids: openid })
    if (storeRes) {
        return {
            code: 0,
            data: {
                role: 'admin',
                storeId: storeRes._id,
                permissions: ADMIN_PERMISSIONS,
                storeName: storeRes.name || ''
            }
        }
    }

    const staffStore = await safeGetFirst('stores', { 'staff.openid': openid })
    if (staffStore) {
        const staffEntry = (staffStore.staff || []).find(item => item.openid === openid) || {}
        return {
            code: 0,
            data: {
                role: 'staff',
                storeId: staffStore._id,
                permissions: mergePermissions(staffEntry.permissions),
                storeName: staffStore.name || '',
                staffName: staffEntry.name || ''
            }
        }
    }

    return { code: 0, data: { role: 'customer', permissions: [] } }
}

async function getWorkbenchSummary(openid) {
    const access = await requireWorkbench(openid, 'viewDashboard')
    if (access.code) return access

    const storeId = access.storeId
    const today = startOfToday()
    const sevenDaysAgo = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000)

    const storeUsers = await safeList('users', { storeId }, { limit: 500 })
    const storeOpenids = storeUsers.map(u => u._openid).filter(Boolean)

    const [
        newLeads,
        tongueCount,
        lotteryCount,
        orderCount,
        pendingRefundCount,
        fissionOrderCount,
        pendingVerifyCount,
        leads7,
        orders7
    ] = await Promise.all([
        safeCount('users', { storeId, createdAt: _.gte(today) }),
        storeOpenids.length ? safeCount('tongue_reports', { _openid: _.in(storeOpenids), createdAt: _.gte(today) }) : 0,
        storeOpenids.length ? safeCount('lottery_records', { _openid: _.in(storeOpenids), createdAt: _.gte(today) }) : 0,
        safeCount('orders', { storeId, createdAt: _.gte(today), status: _.neq('cancelled') }),
        safeCount('orders', { storeId, status: _.in(['refund_requested', 'refunding']) }),
        safeCount('orders', { storeId, createdAt: _.gte(today), fissionCampaignId: _.neq(''), status: _.in(['paid', 'completed']) }),
        getPendingVerifyCount(storeId),
        countLeadEvents(storeId, sevenDaysAgo),
        safeCount('orders', { storeId, createdAt: _.gte(sevenDaysAgo), status: _.in(['paid', 'completed']) })
    ])

    const sevenDayConversionRate = leads7 === 0 ? 0 : Math.round((orders7 / leads7) * 100)

    return {
        code: 0,
        data: {
            role: access.role,
            newLeads,
            tongueCount,
            lotteryCount,
            orderCount,
            pendingRefundCount,
            fissionOrderCount,
            pendingVerifyCount,
            sevenDayConversionRate,
            sevenDayConversionRateText: `${sevenDayConversionRate}%`
        }
    }
}

async function getWorkbenchOrders(event, openid) {
    const access = await requireWorkbench(openid, 'viewOrders')
    if (access.code) return access

    const { status = 'all', page = 1, pageSize = 50 } = event
    const condition = { storeId: access.storeId }
    if (status && status !== 'all') condition.status = status

    const orders = (await safeList('orders', condition, {
        orderBy: ['createdAt', 'desc'],
        skip: (page - 1) * pageSize,
        limit: pageSize
    })).filter(item => !item.storeId || item.storeId === access.storeId)

    const userIds = uniqueValues(orders.map(item => item._openid))
    const refundRequests = await safeList('refund_requests', {
        orderId: _.in(orders.map(item => item._id).filter(Boolean))
    }, { orderBy: ['updatedAt', 'desc'], limit: 100 })

    const users = await fetchUsersMap(userIds)
    const refundMap = {}
    refundRequests.forEach(item => {
        if (!refundMap[item.orderId]) refundMap[item.orderId] = item
    })

    return {
        code: 0,
        data: orders.map(order => ({
            ...order,
            userLabel: users[order._openid]?.nickName || maskOpenid(order._openid),
            statusLabel: orderStatusLabel(order.status),
            leadSourceLabel: getLeadSourceLabel(order),
            refundRequest: refundMap[order._id] ? {
                ...refundMap[order._id],
                statusLabel: refundStatusLabel(refundMap[order._id].status)
            } : null
        }))
    }
}

async function getLeadList(event, openid) {
    const access = await requireWorkbench(openid, 'viewLeads')
    if (access.code) return access

    const storeId = access.storeId
    const { source = 'all' } = event

    const storeUsers = (await safeList('users', { storeId }, { limit: 500 }))
        .filter(item => !item.storeId || item.storeId === storeId)
    const storeOpenids = storeUsers.map(u => u._openid).filter(Boolean)
    const storeCampaigns = (await safeList('fission_campaigns', { storeId }, { limit: 100 }))
        .filter(item => !item.storeId || item.storeId === storeId)
    const storeCampaignIds = storeCampaigns.map(c => c._id).filter(Boolean)

    const [tongueReports, lotteryRecords, orders, fissionRecords, followups] = await Promise.all([
        storeOpenids.length ? safeList('tongue_reports', { _openid: _.in(storeOpenids) }, { orderBy: ['createdAt', 'desc'], limit: 120 }) : [],
        storeOpenids.length ? safeList('lottery_records', { _openid: _.in(storeOpenids) }, { orderBy: ['createdAt', 'desc'], limit: 120 }) : [],
        safeList('orders', { storeId, status: _.in(['paid', 'completed', 'refund_requested', 'refunding']) }, { orderBy: ['createdAt', 'desc'], limit: 120 }),
        storeCampaignIds.length ? safeList('fission_records', { campaignId: _.in(storeCampaignIds) }, { orderBy: ['createdAt', 'desc'], limit: 120 }) : [],
        storeOpenids.length ? safeList('customer_followups', { leadOpenid: _.in(storeOpenids) }, { orderBy: ['updatedAt', 'desc'], limit: 200 }) : []
    ])

    const leadMap = {}
    const followupMap = {}
    followups.forEach(item => {
        if (!followupMap[item.leadOpenid]) followupMap[item.leadOpenid] = item
    })

    tongueReports.forEach(item => mergeLeadTrack(leadMap, item._openid, 'tongue', item.createdAt))
    lotteryRecords.forEach(item => mergeLeadTrack(leadMap, item._openid, 'lottery', item.createdAt))
    orders.forEach(item => mergeLeadTrack(leadMap, item._openid, 'order', item.createdAt))
    fissionRecords.forEach(item => mergeLeadTrack(leadMap, item.inviteeOpenid, 'fission', item.createdAt))

    const selectedOpenids = Object.keys(leadMap).filter(id => {
        if (source === 'all') return true
        return leadMap[id].sources.includes(source)
    })

    const users = await fetchUsersMap(selectedOpenids)

    return {
        code: 0,
        data: selectedOpenids.map(id => {
            const lead = leadMap[id]
            const followup = followupMap[id] || {}
            const user = users[id] || {}
            return {
                _openid: id,
                nickName: user.nickName || '',
                avatarUrl: user.avatarUrl || '',
                primarySourceLabel: leadSourceLabel(lead.sources[0]),
                tracks: lead.sources.map(leadSourceLabel),
                lastActivityAt: lead.lastActivityAt,
                followupStatus: followup.status || 'pending',
                followupStatusLabel: followupStatusLabel(followup.status || 'pending'),
                followupNote: followup.note || ''
            }
        }).sort((a, b) => toTimestamp(b.lastActivityAt) - toTimestamp(a.lastActivityAt))
    }
}

async function upsertFollowup(event, openid) {
    const access = await requireWorkbench(openid, 'viewLeads')
    if (access.code) return access

    const { leadOpenid, status = 'pending', note = '' } = event
    if (!leadOpenid) return { code: -1, msg: '缺少线索用户' }

    const existing = await safeGetFirst('customer_followups', { leadOpenid })
    const payload = {
        leadOpenid,
        status,
        note,
        operatorOpenid: openid,
        updatedAt: db.serverDate()
    }

    if (existing) {
        await db.collection('customer_followups').doc(existing._id).update({ data: payload })
    } else {
        await db.collection('customer_followups').add({
            data: {
                ...payload,
                createdAt: db.serverDate()
            }
        })
    }

    return { code: 0, msg: '跟进已更新' }
}

async function getWorkbenchSettings(openid) {
    const access = await requireWorkbench(openid, 'manageSettings')
    if (access.code) return access

    const storeId = access.storeId
    const [storeInfo, aiConfig, payConfig] = await Promise.all([
        safeGetFirst('stores', { _id: storeId }),
        safeGetFirst('ai_config', { storeId }),
        safeGetFirst('pay_config', { storeId })
    ])

    const safeAiConfig = aiConfig ? {
        ...aiConfig,
        apiKey: aiConfig.apiKey ? '••••••••' : ''
    } : null

    const safePayConfig = payConfig ? {
        ...payConfig,
        mchKey: payConfig.mchKey ? '••••••••' : ''
    } : null

    return {
        code: 0,
        data: {
            storeInfo: storeInfo ? sanitizeStore(storeInfo) : null,
            aiConfig: safeAiConfig,
            payConfig: safePayConfig,
            staff: ((storeInfo && storeInfo.staff) || []).map(item => ({
                ...item,
                permissionsText: mergePermissions(item.permissions).join(' / ')
            }))
        }
    }
}

async function getCatalogOverview(openid) {
    const access = await requireWorkbench(openid, 'manageProducts')
    if (access.code) return access

    const [products, packages] = await Promise.all([
        safeList('products', { storeId: access.storeId }, { orderBy: ['updatedAt', 'desc'], limit: 60 }),
        safeList('packages', { storeId: access.storeId }, { orderBy: ['createdAt', 'desc'], limit: 60 })
    ])

    const productMap = {}
    products.forEach(item => {
        productMap[item._id] = item
    })

    return {
        code: 0,
        data: {
            products,
            packages: packages.map(item => ({
                ...item,
                name: item.name || productMap[item.productId]?.name || '套餐',
                itemsText: (item.items || []).map(service => `${service.name} x${service.count}`).join('、')
            }))
        }
    }
}

async function getCampaignOverview(openid) {
    const access = await requireWorkbench(openid, 'manageCampaigns')
    if (access.code) return access

    const [fissionCampaigns, lotteryCampaigns] = await Promise.all([
        safeList('fission_campaigns', { storeId: access.storeId }, { orderBy: ['createdAt', 'desc'], limit: 30 }),
        safeList('lottery_campaigns', { storeId: access.storeId }, { orderBy: ['createdAt', 'desc'], limit: 30 })
    ])

    return { code: 0, data: { fissionCampaigns, lotteryCampaigns } }
}

async function updateRefundRequest(event, openid) {
    const access = await requireWorkbench(openid, 'manageRefunds')
    if (access.code) return access

    const { requestId, orderId, status } = event
    if (!requestId || !orderId || !status) return { code: -1, msg: '参数不完整' }

    const request = await safeGetById('refund_requests', requestId)
    if (!request) return { code: -1, msg: '退款申请不存在' }
    if (!request.orderId || request.orderId !== orderId) return { code: -1, msg: '退款申请与订单不匹配' }

    const order = await safeGetById('orders', orderId)
    if (!order) return { code: -1, msg: '订单不存在' }
    const storeGuard = ensureStoreOwnership(access.storeId, [request.storeId, order.storeId], '无权限处理该退款')
    if (storeGuard) return storeGuard

    const requestStatus = status === 'approved' ? 'approved' : 'rejected'
    const fallbackOrderStatus = request.previousStatus || order.status || 'paid'
    if (request.status !== 'pending') {
        return { code: -1, msg: '该申请已处理' }
    }
    if (requestStatus === 'approved' && order.status === 'refunded') {
        return { code: -1, msg: '订单已退款，不能重复处理' }
    }

    if (requestStatus === 'approved') {
        return approveRefundRequest({ request, order, reviewerOpenid: openid, storeId: access.storeId })
    }

    await db.runTransaction(async transaction => {
        await transaction.collection('refund_requests').doc(requestId).update({
            data: {
                status: 'rejected',
                reviewedBy: openid,
                reviewedAt: db.serverDate(),
                updatedAt: db.serverDate()
            }
        })

        await transaction.collection('orders').doc(orderId).update({
            data: {
                status: fallbackOrderStatus,
                updatedAt: db.serverDate()
            }
        })
    })

    return { code: 0, msg: '退款申请已驳回' }
}

async function approveRefundRequest({ request, order, reviewerOpenid, storeId }) {
    const payConfig = await safeGetFirst('pay_config', storeId ? { storeId } : {})
    if (!payConfig || !payConfig.mchId) {
        return { code: -1, msg: '支付商户号未配置，无法处理退款' }
    }

    const refundAmount = Number(request.refundAmount || order.payAmount || order.totalAmount || 0)
    if (refundAmount <= 0) {
        return { code: -1, msg: '退款金额异常' }
    }

    const orderItems = await safeList('order_items', { orderId: order._id }, { limit: 100 })
    const productAdjustments = buildProductRollbackAdjustments(order, orderItems)
    const products = await Promise.all(Object.keys(productAdjustments).map(productId => safeGetById('products', productId)))
    const productMap = products.filter(Boolean).reduce((acc, item) => {
        acc[item._id] = item
        return acc
    }, {})

    const refundableRecords = (await safeList('fission_records', {
        orderId: order._id
    }, { limit: 20 })).filter(item => item && item.status !== 'refunded')
    const cashbackAdjustments = buildCashbackRollbackAdjustments(refundableRecords)

    const generatedOutRefundNo = generateRefundNo()
    let outRefundNo = generatedOutRefundNo

    // 查询返现用户文档ID（用于事务内doc更新）
    const inviterUserIds = {}
    for (const inviterOpenid of Object.keys(cashbackAdjustments.byInviter)) {
        const user = await safeGetFirst('users', { _openid: inviterOpenid })
        if (user) inviterUserIds[inviterOpenid] = user._id
    }

    // 先更新为退款处理中状态
    try {
        await db.runTransaction(async transaction => {
            const currentRequestRes = await transaction.collection('refund_requests').doc(request._id).get()
            const currentOrderRes = await transaction.collection('orders').doc(order._id).get()
            const currentRequest = currentRequestRes.data || null
            const currentOrder = currentOrderRes.data || null
            const now = db.serverDate()
            const transition = planEnterRefunding({
                request: currentRequest,
                order: currentOrder,
                reviewerOpenid,
                generatedOutRefundNo,
                now
            })
            outRefundNo = transition.outRefundNo
            if (transition.requestUpdate) {
                await transaction.collection('refund_requests').doc(request._id).update({
                    data: transition.requestUpdate
                })
            }
            if (transition.orderUpdate) {
                await transaction.collection('orders').doc(order._id).update({
                    data: transition.orderUpdate
                })
            }
        })
    } catch (error) {
        console.error('写入退款处理中状态失败:', error)
        return { code: -1, msg: error.message || '退款状态更新失败' }
    }

    let refundResult
    try {
        refundResult = await cloud.cloudPay.refund({
            functionName: 'payApi',
            envId: cloud.DYNAMIC_CURRENT_ENV,
            subMchId: payConfig.mchId,
            nonceStr: randomToken(24),
            transactionId: order.paymentId || undefined,
            outTradeNo: order.orderNo,
            outRefundNo,
            totalFee: Number(order.payAmount || order.totalAmount || 0),
            refundFee: refundAmount,
            refundDesc: request.reason || order.refundReason || '用户申请退款'
        })
    } catch (error) {
        console.error('发起退款失败:', error)
        return { code: -1, msg: error.message || '发起退款失败' }
    }

    if (refundResult.returnCode !== 'SUCCESS' || refundResult.resultCode !== 'SUCCESS') {
        return {
            code: -1,
            msg: refundResult.errCodeDes || refundResult.returnMsg || '退款申请失败'
        }
    }

    try {
        await db.runTransaction(async transaction => {
            const currentRequestRes = await transaction.collection('refund_requests').doc(request._id).get()
            const currentOrderRes = await transaction.collection('orders').doc(order._id).get()
            const currentRequest = currentRequestRes.data || null
            const currentOrder = currentOrderRes.data || null

            const now = db.serverDate()
            const finalize = planFinalizeRefund({
                request: currentRequest,
                order: currentOrder,
                reviewerOpenid,
                outRefundNo,
                refundResult,
                now
            })
            await transaction.collection('refund_requests').doc(request._id).update({
                data: finalize.requestUpdate
            })

            await transaction.collection('orders').doc(order._id).update({
                data: finalize.orderUpdate
            })

            for (const productId of Object.keys(productAdjustments)) {
                const adjustment = productAdjustments[productId]
                const product = productMap[productId]
                if (!product || !adjustment) continue
                const data = {
                    soldCount: _.inc(-adjustment.quantity)
                }
                if (Number(product.stock) !== -1) {
                    data.stock = _.inc(adjustment.quantity)
                }
                await transaction.collection('products').doc(productId).update({ data })
            }

            const campaignUpdate = {}
            if (order.fissionCampaignId) {
                campaignUpdate.soldCount = _.inc(-Number(order.quantity || 1))
            }
            if (cashbackAdjustments.totalCashback > 0) {
                campaignUpdate.newCustomers = _.inc(-cashbackAdjustments.recordCount)
                campaignUpdate.totalCashback = _.inc(-cashbackAdjustments.totalCashback)
            }
            if (order.fissionCampaignId && Object.keys(campaignUpdate).length > 0) {
                await transaction.collection('fission_campaigns').doc(order.fissionCampaignId).update({
                    data: campaignUpdate
                })
            }

            for (const record of refundableRecords) {
                await transaction.collection('fission_records').doc(record._id).update({
                    data: {
                        status: 'refunded',
                        refundedAt: now,
                        refundRequestId: request._id
                    }
                })
            }

            for (const inviterOpenid of Object.keys(cashbackAdjustments.byInviter)) {
                const adjustment = cashbackAdjustments.byInviter[inviterOpenid]
                const userDocId = inviterUserIds[inviterOpenid]
                if (!userDocId) continue
                await transaction.collection('users').doc(userDocId).update({
                    data: {
                        balance: _.inc(-adjustment.cashbackAmount),
                        totalEarned: _.inc(-adjustment.cashbackAmount),
                        totalInvited: _.inc(-adjustment.recordCount),
                        updatedAt: now
                    }
                })
            }
        })
    } catch (error) {
        console.error('落库退款结果失败:', error)
        return { code: -1, msg: error.message || '退款结果保存失败' }
    }

    return { code: 0, msg: '退款已完成' }
}

async function requireWorkbench(openid, requiredPermission = '') {
    const accessResult = await getWorkbenchAccess(openid)
    const access = accessResult.data || {}

    if (access.role !== 'admin' && access.role !== 'staff') {
        return { code: 403, msg: '无工作台权限' }
    }

    if (requiredPermission && access.role !== 'admin' && !(access.permissions || []).includes(requiredPermission)) {
        return { code: 403, msg: '无访问权限' }
    }

    return access
}

function mergePermissions(permissions = []) {
    const filtered = [].concat(permissions || []).filter(item => STAFF_PERMISSION_WHITELIST.includes(item))
    return Array.from(new Set([].concat(STAFF_DEFAULT_PERMISSIONS, filtered)))
}

async function resolveUserStoreId({ openid, invitedBy = '', currentUser = null } = {}) {
    const directUser = currentUser || await safeGetFirst('users', { _openid: openid })
    if (directUser && directUser.storeId) return directUser.storeId

    const adminStore = await safeGetFirst('stores', { adminOpenids: openid })
    if (adminStore && adminStore._id) return adminStore._id

    const staffStore = await safeGetFirst('stores', { 'staff.openid': openid })
    if (staffStore && staffStore._id) return staffStore._id

    if (invitedBy && invitedBy !== openid) {
        const inviterUser = await safeGetFirst('users', { _openid: invitedBy })
        if (inviterUser && inviterUser.storeId) return inviterUser.storeId

        const inviterAdminStore = await safeGetFirst('stores', { adminOpenids: invitedBy })
        if (inviterAdminStore && inviterAdminStore._id) return inviterAdminStore._id

        const inviterStaffStore = await safeGetFirst('stores', { 'staff.openid': invitedBy })
        if (inviterStaffStore && inviterStaffStore._id) return inviterStaffStore._id
    }

    const stores = await safeList('stores', {}, { limit: 2 })
    if (stores.length === 1) return stores[0]._id || ''

    return ''
}

function ensureStoreOwnership(expectedStoreId, candidateStoreIds, message) {
    const normalizedStoreIds = uniqueValues((candidateStoreIds || []).map(item => String(item || '').trim()).filter(Boolean))
    if (normalizedStoreIds.length !== 1 || normalizedStoreIds[0] !== expectedStoreId) {
        return { code: 403, msg: message || '无门店权限' }
    }
    return null
}

function sanitizeStore(store) {
    const { adminOpenids, staff, ...rest } = store
    return rest
}

async function getPendingVerifyCount(storeId) {
    const orders = await safeList('orders', { storeId, status: _.in(['paid', 'completed']) }, { limit: 200 })
    const orderIds = orders.map(o => o._id).filter(Boolean)
    if (!orderIds.length) return 0

    const items = await safeList('order_items', {
        orderId: _.in(orderIds),
        productType: _.in(['service', 'package'])
    }, { limit: 200 })
    if (!items.length) return 0

    const orderMap = await fetchOrdersMap(orderIds)
    return items.filter(item => {
        const order = orderMap[item.orderId]
        if (!order || !['paid', 'completed'].includes(order.status)) return false
        if (item.productType === 'service') {
            return !(item.packageRemaining && item.packageRemaining.used)
        }
        return hasPackageRemaining(item.packageRemaining)
    }).length
}

async function countLeadEvents(storeId, sinceDate) {
    const [users, campaigns] = await Promise.all([
        safeList('users', { storeId }, { limit: 500 }),
        safeList('fission_campaigns', { storeId }, { limit: 100 })
    ])
    const openids = users.map(u => u._openid).filter(Boolean)
    const campaignIds = campaigns.map(c => c._id).filter(Boolean)

    const [tongueCount, lotteryCount, fissionCount] = await Promise.all([
        openids.length ? safeCount('tongue_reports', { _openid: _.in(openids), createdAt: _.gte(sinceDate) }) : 0,
        openids.length ? safeCount('lottery_records', { _openid: _.in(openids), createdAt: _.gte(sinceDate) }) : 0,
        campaignIds.length ? safeCount('fission_records', { campaignId: _.in(campaignIds), createdAt: _.gte(sinceDate) }) : 0
    ])
    return tongueCount + lotteryCount + fissionCount
}

function hasPackageRemaining(packageRemaining) {
    if (!packageRemaining) return true
    return Object.keys(packageRemaining).some(key => {
        if (key === 'used') return packageRemaining[key] !== true
        return (packageRemaining[key] || 0) > 0
    })
}

function mergeLeadTrack(leadMap, openid, source, timestamp) {
    if (!openid) return
    if (!leadMap[openid]) {
        leadMap[openid] = {
            sources: [],
            lastActivityAt: timestamp
        }
    }
    if (!leadMap[openid].sources.includes(source)) {
        leadMap[openid].sources.push(source)
    }
    if (toTimestamp(timestamp) > toTimestamp(leadMap[openid].lastActivityAt)) {
        leadMap[openid].lastActivityAt = timestamp
    }
}

async function fetchUsersMap(openids) {
    const ids = uniqueValues(openids)
    if (!ids.length) return {}
    const users = await safeList('users', { _openid: _.in(ids) }, { limit: ids.length })
    return users.reduce((acc, item) => {
        acc[item._openid] = item
        return acc
    }, {})
}

async function fetchOrdersMap(orderIds) {
    const ids = uniqueValues(orderIds)
    if (!ids.length) return {}
    const orders = await safeList('orders', { _id: _.in(ids) }, { limit: ids.length })
    return orders.reduce((acc, item) => {
        acc[item._id] = item
        return acc
    }, {})
}

function buildProductRollbackAdjustments(order, orderItems = []) {
    const adjustments = {}
    if (orderItems.length > 0) {
        orderItems.forEach(item => {
            if (!item || !item.productId) return
            adjustments[item.productId] = {
                productId: item.productId,
                quantity: (adjustments[item.productId]?.quantity || 0) + Number(item.quantity || 0)
            }
        })
        return adjustments
    }

    if (order && order.productId) {
        adjustments[order.productId] = {
            productId: order.productId,
            quantity: Number(order.quantity || 1)
        }
    }
    return adjustments
}

function buildCashbackRollbackAdjustments(records = []) {
    return records.reduce((acc, item) => {
        const inviterOpenid = item && item.inviterOpenid ? item.inviterOpenid : ''
        const cashbackAmount = Number(item && item.cashbackAmount ? item.cashbackAmount : 0)
        if (!inviterOpenid || cashbackAmount <= 0) return acc

        if (!acc.byInviter[inviterOpenid]) {
            acc.byInviter[inviterOpenid] = { cashbackAmount: 0, recordCount: 0 }
        }
        acc.byInviter[inviterOpenid].cashbackAmount += cashbackAmount
        acc.byInviter[inviterOpenid].recordCount += 1
        acc.totalCashback += cashbackAmount
        acc.recordCount += 1
        return acc
    }, {
        totalCashback: 0,
        recordCount: 0,
        byInviter: {}
    })
}

function generateRefundNo() {
    return `RFD${Date.now()}${randomToken(8)}`
}

function randomToken(length = 12) {
    const seed = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let output = ''
    for (let i = 0; i < length; i += 1) {
        output += seed[Math.floor(Math.random() * seed.length)]
    }
    return output
}

async function safeCount(collectionName, condition) {
    try {
        const res = await db.collection(collectionName).where(condition || {}).count()
        return res.total || 0
    } catch (error) {
        return 0
    }
}

async function safeGetFirst(collectionName, condition) {
    try {
        const res = await db.collection(collectionName).where(condition || {}).limit(1).get()
        return res.data[0] || null
    } catch (error) {
        return null
    }
}

async function safeGetById(collectionName, id) {
    try {
        const res = await db.collection(collectionName).doc(id).get()
        return res.data || null
    } catch (error) {
        return null
    }
}

async function safeList(collectionName, condition = {}, options = {}) {
    try {
        let query = db.collection(collectionName).where(condition)
        if (options.orderBy) {
            query = query.orderBy(options.orderBy[0], options.orderBy[1])
        }
        if (options.skip) query = query.skip(options.skip)
        query = query.limit(options.limit || 20)
        const res = await query.get()
        return res.data || []
    } catch (error) {
        return []
    }
}

function uniqueValues(list) {
    return Array.from(new Set((list || []).filter(Boolean)))
}

function startOfToday() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return today
}

function orderStatusLabel(status) {
    const map = {
        pending: '待支付',
        paid: '已支付',
        completed: '已完成',
        refund_requested: '退款申请中',
        refunding: '退款处理中',
        refunded: '已退款',
        cancelled: '已取消'
    }
    return map[status] || status || '未知状态'
}

function refundStatusLabel(status) {
    const map = {
        pending: '待处理',
        approved: '已同意',
        rejected: '已驳回',
        refunded: '已退款'
    }
    return map[status] || status || '待处理'
}

function followupStatusLabel(status) {
    const map = {
        pending: '待跟进',
        contacted: '已联系',
        visited: '已到店',
        converted: '已成交'
    }
    return map[status] || '待跟进'
}

function getLeadSourceLabel(order) {
    if (!order) return '自然到店'
    if (order.fissionCampaignId) return '裂变活动'
    return '自然到店'
}

function leadSourceLabel(source) {
    const map = {
        tongue: 'AI 舌象',
        lottery: '幸运抽奖',
        order: '下单客户',
        fission: '分享裂变'
    }
    return map[source] || '自然到店'
}

function maskOpenid(openid) {
    if (!openid) return '匿名用户'
    return `${openid.slice(0, 3)}***${openid.slice(-3)}`
}

function toTimestamp(value) {
    if (!value) return 0
    if (typeof value === 'object' && value.$date !== undefined) return value.$date
    return Number(new Date(value)) || 0
}
