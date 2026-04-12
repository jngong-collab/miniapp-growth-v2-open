const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

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

exports.main = async (event) => {
    const { OPENID } = cloud.getWXContext()
    const { action } = event

    switch (action) {
        case 'ensureUser':
            return ensureUser(OPENID, event)
        case 'getStoreInfo':
            return getStoreInfo()
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
    const store = await safeGetFirst('stores', {})
    const storeId = store ? store._id : ''

    let user = await safeGetFirst('users', { _openid: openid })
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

async function getStoreInfo() {
    const storeRes = await safeGetFirst('stores', {})
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

    if (item.productType === 'package') {
        if (!serviceName) return { code: -1, msg: '请指定要核销的服务项目' }
        const remaining = item.packageRemaining || {}
        if (!remaining[serviceName] || remaining[serviceName] <= 0) {
            return { code: -1, msg: `「${serviceName}」已无剩余次数` }
        }
        remaining[serviceName] = remaining[serviceName] - 1
        await db.collection('order_items').doc(item._id).update({
            data: { packageRemaining: remaining }
        })
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

    const today = startOfToday()
    const sevenDaysAgo = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000)

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
        safeCount('users', { createdAt: _.gte(today) }),
        safeCount('tongue_reports', { createdAt: _.gte(today) }),
        safeCount('lottery_records', { createdAt: _.gte(today) }),
        safeCount('orders', { createdAt: _.gte(today), status: _.neq('cancelled') }),
        safeCount('orders', { status: _.in(['refund_requested', 'refunding']) }),
        safeCount('orders', { createdAt: _.gte(today), fissionCampaignId: _.neq(''), status: _.in(['paid', 'completed']) }),
        getPendingVerifyCount(),
        countLeadEvents(sevenDaysAgo),
        safeCount('orders', { createdAt: _.gte(sevenDaysAgo), status: _.in(['paid', 'completed']) })
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
    const condition = {}
    if (status && status !== 'all') condition.status = status

    const orders = await safeList('orders', condition, {
        orderBy: ['createdAt', 'desc'],
        skip: (page - 1) * pageSize,
        limit: pageSize
    })

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

    const { source = 'all' } = event

    const [tongueReports, lotteryRecords, orders, fissionRecords, followups] = await Promise.all([
        safeList('tongue_reports', {}, { orderBy: ['createdAt', 'desc'], limit: 120 }),
        safeList('lottery_records', {}, { orderBy: ['createdAt', 'desc'], limit: 120 }),
        safeList('orders', { status: _.in(['paid', 'completed', 'refund_requested', 'refunding']) }, { orderBy: ['createdAt', 'desc'], limit: 120 }),
        safeList('fission_records', {}, { orderBy: ['createdAt', 'desc'], limit: 120 }),
        safeList('customer_followups', {}, { orderBy: ['updatedAt', 'desc'], limit: 200 })
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

    const [storeInfo, aiConfig, payConfig] = await Promise.all([
        safeGetFirst('stores', {}),
        safeGetFirst('ai_config', {}),
        safeGetFirst('pay_config', {})
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
        safeList('products', {}, { orderBy: ['updatedAt', 'desc'], limit: 60 }),
        safeList('packages', {}, { orderBy: ['createdAt', 'desc'], limit: 60 })
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
        safeList('fission_campaigns', {}, { orderBy: ['createdAt', 'desc'], limit: 30 }),
        safeList('lottery_campaigns', {}, { orderBy: ['createdAt', 'desc'], limit: 30 })
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

    const requestStatus = status === 'approved' ? 'approved' : 'rejected'
    const fallbackOrderStatus = request.previousStatus || order.status || 'paid'
    const orderStatus = requestStatus === 'approved' ? 'refunding' : fallbackOrderStatus
    if (request.status !== 'pending') {
        return { code: -1, msg: '该申请已处理' }
    }
    if (requestStatus === 'approved' && order.status === 'refunded') {
        return { code: -1, msg: '订单已退款，不能重复处理' }
    }

    await db.collection('refund_requests').doc(requestId).update({
        data: {
            status: requestStatus,
            reviewedBy: openid,
            reviewedAt: db.serverDate(),
            updatedAt: db.serverDate()
        }
    })

    await db.collection('orders').doc(orderId).update({
        data: {
            status: orderStatus,
            updatedAt: db.serverDate()
        }
    })

    return { code: 0, msg: '退款申请已处理' }
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
    return Array.from(new Set([].concat(STAFF_DEFAULT_PERMISSIONS, permissions || [])))
}

function sanitizeStore(store) {
    const { adminOpenids, staff, ...rest } = store
    return rest
}

async function getPendingVerifyCount() {
    const items = await safeList('order_items', {
        productType: _.in(['service', 'package'])
    }, { limit: 200 })
    if (!items.length) return 0

    const orderMap = await fetchOrdersMap(uniqueValues(items.map(item => item.orderId)))
    return items.filter(item => {
        const order = orderMap[item.orderId]
        if (!order || !['paid', 'completed'].includes(order.status)) return false
        if (item.productType === 'service') {
            return !(item.packageRemaining && item.packageRemaining.used)
        }
        return hasPackageRemaining(item.packageRemaining)
    }).length
}

async function countLeadEvents(sinceDate) {
    const [tongueCount, lotteryCount, fissionCount] = await Promise.all([
        safeCount('tongue_reports', { createdAt: _.gte(sinceDate) }),
        safeCount('lottery_records', { createdAt: _.gte(sinceDate) }),
        safeCount('fission_records', { createdAt: _.gte(sinceDate) })
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
