const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const crypto = require('crypto')
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
const MEMBER_LEVELS = ['normal', 'vip', 'svip']
const AUTH_SESSION_COLLECTION = 'auth_sessions'
const AUTH_SESSION_TTL_DAYS = 30
const AUTH_REQUIRED_CODE = 401
const AUTH_REQUIRED_MSG = '未登录，请先完成手机号登录'

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
        case 'getSession':
        case 'resumeSession':
            return getSession(event, OPENID)
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
        case 'loginWithPhone':
            return loginWithPhone(event, OPENID)
        case 'bindPhoneNumber':
            return bindPhoneNumber(event, OPENID)
        case 'updateUserProfile':
            return updateUserProfile(event, OPENID)
        case 'ensureAuth':
            return ensureAuth(event, OPENID)
        case 'logout':
            return logout(event, OPENID)
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
            memberLevel: normalizeMemberLevel('normal'),
            profileCompleted: false,
            phoneBoundAt: '',
            loginStatus: 'logged_out',
            createdAt: db.serverDate(),
            updatedAt: db.serverDate()
        }
        const addRes = await db.collection('users').add({ data: payload })
        if (!addRes._id) return { code: -1, msg: '用户初始化失败' }
        user = await safeGetFirst('users', { _openid: openid })
        if (!user) {
            user = { ...payload, _id: addRes._id, openid }
        }
    } else if (normalizeMemberLevel(user.memberLevel) !== user.memberLevel) {
        await db.collection('users').where({ _openid: openid }).update({
            data: { memberLevel: normalizeMemberLevel(user.memberLevel), updatedAt: db.serverDate() }
        })
        user.memberLevel = normalizeMemberLevel(user.memberLevel)
    }

    if (user && !user.phoneBoundAt) {
        await db.collection('users').where({ _openid: openid }).update({
            data: { phoneBoundAt: '', updatedAt: db.serverDate() }
        })
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

    const sanitizedUser = await sanitizeUserProfile(user)
    return { code: 0, openid, data: sanitizedUser }
}

async function getSession(event, openid) {
    return ensureAuth(event, openid)
}

async function bindPhoneNumber(event, openid) {
    const loginRes = await loginWithPhone(event, openid, { includeUser: true, includeSession: true })
    if (loginRes.code) return loginRes

    return {
        code: 0,
        msg: loginRes.msg || '绑定成功',
        data: {
            phone: loginRes.data.phone,
            sessionToken: loginRes.data.sessionToken,
            expiresAt: loginRes.data.expiresAt,
            user: loginRes.data.user || null
        }
    }
}

async function updateUserProfile(event, openid) {
    if (!openid) return { code: -1, msg: '缺少用户身份' }

    const authRes = await ensureAuth(event, openid)
    if (authRes.code) return authRes

    const user = await safeGetFirst('users', { _openid: openid })
    if (!user || !user._id) {
        return { code: -1, msg: '用户不存在' }
    }

    const hasNickName = Object.prototype.hasOwnProperty.call(event || {}, 'nickName')
    const hasAvatarFileId = Object.prototype.hasOwnProperty.call(event || {}, 'avatarFileId')
    if (!hasNickName && !hasAvatarFileId) {
        return { code: -1, msg: '缺少可更新资料' }
    }

    const updateData = {
        updatedAt: db.serverDate()
    }

    if (hasNickName) {
        const nickName = String((event || {}).nickName || '').trim()
        if (!nickName) {
            return { code: -1, msg: '昵称不能为空' }
        }
        updateData.nickName = nickName
    }

    if (hasAvatarFileId) {
        const avatarFileId = String((event || {}).avatarFileId || '').trim()
        if (!avatarFileId) {
            return { code: -1, msg: '头像文件不能为空' }
        }
        if (!avatarFileId.startsWith('cloud://')) {
            return { code: -1, msg: '头像文件异常' }
        }
        updateData.avatarUrl = avatarFileId
    }

    await db.collection('users').doc(user._id).update({
        data: updateData
    })

    const latestUser = await safeGetFirst('users', { _openid: openid })
    const sanitizedUser = await sanitizeUserProfile(latestUser)

    return {
        code: 0,
        msg: '资料已更新',
        data: {
            user: sanitizedUser
        }
    }
}

async function loginWithPhone(event, openid, options = {}) {
    if (!openid) return { code: -1, msg: '缺少用户身份' }

    const { code } = event || {}
    if (!code) return { code: -1, msg: '缺少手机号授权码' }

    let phoneNumber = ''
    try {
        const phoneRes = await cloud.openapi.phonenumber.getPhoneNumber({ code })
        phoneNumber = extractPhoneNumberFromOpenApiResult(phoneRes)
        if (!phoneNumber) {
            console.error('phonenumber.getPhoneNumber 未识别手机号字段:', summarizePhoneOpenApiResult(phoneRes))
        }
    } catch (err) {
        const phoneError = normalizePhoneNumberOpenApiError(err)
        console.error('phonenumber.getPhoneNumber 失败:', {
            code: phoneError.code,
            debugMsg: phoneError.debugMsg,
            raw: err
        })
        return { code: phoneError.code, msg: phoneError.msg }
    }

    if (!phoneNumber) {
        return { code: -1, msg: '未能解析手机号' }
    }

    let user = await safeGetFirst('users', { _openid: openid })
    if (!user) {
        const initRes = await ensureUser(openid, event)
        if (initRes.code) return { code: -1, msg: initRes.msg || '用户初始化失败' }
        user = initRes.data
    }

    // 重复绑定：如果已有相同手机号，直接返回成功；如果不同，允许更新（换号场景）
    const updateData = {
        phone: phoneNumber,
        phoneBoundAt: db.serverDate(),
        profileCompleted: true,
        lastLoginAt: db.serverDate(),
        loginStatus: 'logged_in',
        memberLevel: normalizeMemberLevel(user.memberLevel),
        updatedAt: db.serverDate()
    }

    try {
        await db.collection('users').where({ _openid: openid }).update({ data: updateData })
    } catch (err) {
        console.error('更新用户手机号失败:', err)
        return { code: -1, msg: '绑定失败，请稍后重试' }
    }

    const latestUser = await safeGetFirst('users', { _openid: openid })
    if (!latestUser) return { code: -1, msg: '用户不存在' }

    const session = await rotateSession({
        openid,
        user: latestUser,
        phone: phoneNumber,
        preserveUserMembership: true
    })
    if (!session) return { code: -1, msg: '登录态创建失败，请稍后重试' }

    const payload = {
        phone: phoneNumber,
        sessionToken: session.token,
        expiresAt: session.expiresAt
    }

    if (options.includeSession === false) {
        return { code: 0, msg: '绑定成功', data: payload }
    }

    if (options.includeUser) {
        const sanitizedUser = await sanitizeUserProfile(latestUser)
        payload.user = {
            _id: sanitizedUser._id || '',
            _openid: sanitizedUser._openid || openid,
            nickName: sanitizedUser.nickName || '',
            avatarUrl: sanitizedUser.avatarUrl || '',
            avatarFileId: sanitizedUser.avatarFileId || '',
            storeId: sanitizedUser.storeId || '',
            phone: sanitizedUser.phone || '',
            phoneBoundAt: sanitizedUser.phoneBoundAt || '',
            profileCompleted: sanitizedUser.profileCompleted === true,
            memberLevel: normalizeMemberLevel(sanitizedUser.memberLevel),
            loginStatus: sanitizedUser.loginStatus || 'logged_in'
        }
    }

    return {
        code: 0,
        msg: '绑定成功',
        data: payload
    }
}

async function ensureAuth(event, openid) {
    const sessionToken = String(((event || {}).sessionToken || '')).trim()
    if (!sessionToken) return { code: AUTH_REQUIRED_CODE, msg: AUTH_REQUIRED_MSG }

    const session = await safeGetFirst(AUTH_SESSION_COLLECTION, {
        token: sessionToken,
        _openid: openid,
        status: 'active'
    })
    if (!session) return { code: AUTH_REQUIRED_CODE, msg: AUTH_REQUIRED_MSG }

    if (isSessionExpired(session)) {
        await markSessionExpired(session)
        return { code: AUTH_REQUIRED_CODE, msg: '登录已过期，请重新登录' }
    }

    const user = await safeGetFirst('users', { _openid: openid })
    if (!user) {
        await markSessionExpired(session)
        return { code: -1, msg: '用户不存在' }
    }

    if (!user.phone) {
        return { code: AUTH_REQUIRED_CODE, msg: '请先绑定手机号' }
    }

    const normalizedMemberLevel = normalizeMemberLevel(user.memberLevel)
    if (normalizedMemberLevel !== user.memberLevel) {
        await db.collection('users').where({ _openid: openid }).update({
            data: {
                memberLevel: normalizedMemberLevel,
                updatedAt: db.serverDate()
            }
        })
        user.memberLevel = normalizedMemberLevel
    }

    const renewed = await refreshSession(session)
    const sessionExpiresAt = renewed ? renewed.expiresAt : session.expiresAt
    await db.collection('users').where({ _openid: openid }).update({
        data: {
            loginStatus: 'logged_in',
            lastLoginAt: db.serverDate(),
            updatedAt: db.serverDate()
        }
    })

    const sanitizedUser = await sanitizeUserProfile(user)

    return {
        code: 0,
        data: {
            user: sanitizedUser,
            session: {
                token: session.token,
                expiresAt: sessionExpiresAt
            }
        }
    }
}

async function logout(event, openid) {
    const sessionToken = String(((event || {}).sessionToken || '')).trim()
    const baseFilter = { _openid: openid, status: 'active' }
    if (sessionToken) baseFilter.token = sessionToken

    try {
        await db.collection(AUTH_SESSION_COLLECTION).where(baseFilter).update({
            data: {
                status: 'revoked',
                revokedAt: db.serverDate(),
                updatedAt: db.serverDate()
            }
        })

        await db.collection('users').where({ _openid: openid }).update({
            data: {
                loginStatus: 'logged_out',
                updatedAt: db.serverDate()
            }
        })
    } catch (error) {
        console.error('退出登录失败:', error)
    }

    return { code: 0, msg: '已退出登录' }
}

async function getStoreInfo(openid) {
    const storeId = await resolveUserStoreId({ openid })
    if (!storeId) return { code: 0, data: null }
    const storeRes = await safeGetFirst('stores', { _id: storeId })
    if (!storeRes) return { code: 0, data: null }
    return { code: 0, data: await sanitizeStore(storeRes) }
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
        const updateRes = await db.collection('order_items').where({
            _id: item._id,
            'packageRemaining.used': _.neq(true)
        }).update({
            data: {
                'packageRemaining.used': true,
                'packageRemaining.usedAt': db.serverDate()
            }
        })
        if ((updateRes.stats && updateRes.stats.updated) === 0) {
            return { code: -1, msg: '该服务已核销，不可重复核销' }
        }
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
        apiV3Key: payConfig.apiV3Key ? '••••••••' : '',
        privateKey: payConfig.privateKey ? '••••••••' : '',
        certificatePem: payConfig.certificatePem ? '••••••••' : ''
    } : null

    return {
        code: 0,
        data: {
            storeInfo: storeInfo ? await sanitizeStore(storeInfo) : null,
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
    if (requestStatus === 'approved') {
        if (request.status === 'refunded' || order.status === 'refunded') {
            return { code: 0, msg: '退款已完成' }
        }
        if (request.status !== 'pending' && !(request.status === 'refunding' && order.status === 'refunding')) {
            return { code: -1, msg: '该申请已处理' }
        }
    } else if (request.status !== 'pending') {
        return { code: -1, msg: '该申请已处理' }
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
    if (!hasCompletePayConfig(payConfig)) {
        return { code: -1, msg: '支付配置不完整，请先在后台补充 API_V3_KEY、证书序列号、证书私钥和证书文件' }
    }

    const paidAmount = getPaidAmount(order)
    const refundAmount = toCurrencyAmount(request.refundAmount || paidAmount)
    if (!Number.isFinite(paidAmount) || paidAmount <= 0 || !Number.isFinite(refundAmount) || refundAmount <= 0) {
        return { code: -1, msg: '退款金额异常' }
    }
    if (refundAmount > paidAmount) {
        return { code: -1, msg: '退款金额不能超过实付金额' }
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
    const inviterUserIds = await resolveCashbackUserDocIds(cashbackAdjustments)

    const generatedOutRefundNo = generateRefundNo()
    let outRefundNo = generatedOutRefundNo
    let refundStage = { mode: 'transition', outRefundNo, refundResult: null }

    try {
        await db.runTransaction(async transaction => {
            const currentRequestRes = await transaction.collection('refund_requests').doc(request._id).get()
            const currentOrderRes = await transaction.collection('orders').doc(order._id).get()
            const currentRequest = currentRequestRes.data || null
            const currentOrder = currentOrderRes.data || null
            if (isRefundFinalized(currentRequest, currentOrder)) {
                refundStage = {
                    mode: 'already_finalized',
                    outRefundNo: currentRequest && currentRequest.outRefundNo ? currentRequest.outRefundNo : (currentOrder && currentOrder.refundNo ? currentOrder.refundNo : outRefundNo),
                    refundResult: buildAcceptedRefundResult(currentRequest || {})
                }
                return
            }

            const now = db.serverDate()
            const transition = planEnterRefunding({
                request: currentRequest,
                order: currentOrder,
                reviewerOpenid,
                generatedOutRefundNo,
                now
            })
            outRefundNo = transition.outRefundNo
            if (transition.mode === 'resume') {
                refundStage = hasAcceptedRefundResult(currentRequest)
                    ? {
                        mode: 'resume_finalize',
                        outRefundNo,
                        refundResult: buildAcceptedRefundResult(currentRequest)
                    }
                    : {
                        mode: 'resume_wait',
                        outRefundNo,
                        refundResult: null
                    }
                return
            }

            refundStage = { mode: transition.mode, outRefundNo, refundResult: null }
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

    if (refundStage.mode === 'already_finalized') {
        return { code: 0, msg: '退款已完成' }
    }

    if (refundStage.mode === 'resume_wait') {
        return { code: -1, msg: '退款处理中，请勿重复提交' }
    }

    let refundResult = refundStage.refundResult
    if (!refundResult) {
        try {
            refundResult = await cloud.cloudPay.refund({
                functionName: 'payApi',
                envId: cloud.DYNAMIC_CURRENT_ENV,
                subMchId: payConfig.mchId,
                nonceStr: randomToken(24),
                transactionId: order.paymentId || undefined,
                outTradeNo: order.orderNo,
                outRefundNo,
                totalFee: paidAmount,
                refundFee: refundAmount,
                refundDesc: request.reason || order.refundReason || '用户申请退款'
            })
        } catch (error) {
            await rollbackRefundingState({
                requestId: request._id,
                orderId: order._id,
                outRefundNo,
                reason: error.message || '发起退款失败'
            })
            console.error('发起退款失败:', error)
            return { code: -1, msg: error.message || '发起退款失败' }
        }

        if (refundResult.returnCode !== 'SUCCESS' || refundResult.resultCode !== 'SUCCESS') {
            await rollbackRefundingState({
                requestId: request._id,
                orderId: order._id,
                outRefundNo,
                reason: refundResult.errCodeDes || refundResult.returnMsg || '退款申请失败'
            })
            return {
                code: -1,
                msg: refundResult.errCodeDes || refundResult.returnMsg || '退款申请失败'
            }
        }

        try {
            await persistAcceptedRefundResult(request._id, outRefundNo, refundResult)
        } catch (error) {
            console.error('保存退款网关结果失败:', error)
        }
    }

    let finalizeSkipped = false
    try {
        await db.runTransaction(async transaction => {
            const currentRequestRes = await transaction.collection('refund_requests').doc(request._id).get()
            const currentOrderRes = await transaction.collection('orders').doc(order._id).get()
            const currentRequest = currentRequestRes.data || null
            const currentOrder = currentOrderRes.data || null
            if (isRefundFinalized(currentRequest, currentOrder)) {
                finalizeSkipped = true
                return
            }

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
        try {
            await persistAcceptedRefundResult(request._id, outRefundNo, refundResult)
        } catch (persistError) {
            console.error('退款落库失败后补写网关结果失败:', persistError)
        }
        console.error('落库退款结果失败:', error)
        return { code: -1, msg: error.message || '退款结果保存失败' }
    }

    if (finalizeSkipped) {
        return { code: 0, msg: '退款已完成' }
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

async function resolveCloudFileMap(fileList = []) {
    const uniqueFileList = [...new Set((fileList || []).filter(item => item && String(item).startsWith('cloud://')).map(String))]
    if (!uniqueFileList.length) return {}
    try {
        const res = await cloud.getTempFileURL({ fileList: uniqueFileList })
        return (res.fileList || []).reduce((acc, item) => {
            if (item.fileID && item.tempFileURL) {
                acc[item.fileID] = item.tempFileURL
            }
            return acc
        }, {})
    } catch (error) {
        console.error('opsApi 转换云存储资源失败:', error)
        return {}
    }
}

async function sanitizeUserProfile(user) {
    if (!user) return null

    const nextUser = { ...user }
    const avatarFileId = String(nextUser.avatarUrl || '').trim()
    if (!avatarFileId.startsWith('cloud://')) {
        nextUser.avatarFileId = ''
        nextUser.avatarUrl = avatarFileId
        return nextUser
    }

    const fileMap = await resolveCloudFileMap([avatarFileId])
    nextUser.avatarFileId = avatarFileId
    nextUser.avatarUrl = fileMap[avatarFileId] || ''
    return nextUser
}

async function sanitizeStore(store) {
    const { adminOpenids, staff, ...rest } = store
    const fileMap = await resolveCloudFileMap([
        rest.logo,
        ...(Array.isArray(rest.banners) ? rest.banners : [])
    ])
    return {
        ...rest,
        logo: fileMap[rest.logo] || rest.logo || '',
        banners: Array.isArray(rest.banners) ? rest.banners.map(item => fileMap[item] || item) : []
    }
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
    const fileMap = await resolveCloudFileMap(users.map(item => item.avatarUrl))
    return users.reduce((acc, item) => {
        const avatarFileId = String(item.avatarUrl || '').trim()
        acc[item._openid] = {
            ...item,
            avatarFileId: avatarFileId.startsWith('cloud://') ? avatarFileId : '',
            avatarUrl: avatarFileId.startsWith('cloud://')
                ? (fileMap[avatarFileId] || '')
                : avatarFileId
        }
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
    const seedLen = seed.length
    let output = ''
    const randomBytes = crypto.randomBytes(length)
    for (let i = 0; i < length; i += 1) {
        output += seed[randomBytes[i] % seedLen]
    }
    return output
}

function hasCompletePayConfig(payConfig) {
    if (!payConfig || payConfig.enabled === false) return false
    return Boolean(payConfig.mchId && payConfig.apiV3Key && payConfig.certSerialNo && payConfig.privateKey && payConfig.certificatePem)
}

function toCurrencyAmount(value) {
    const amount = Number(value || 0)
    return Number.isFinite(amount) ? amount : NaN
}

function getPaidAmount(order) {
    return toCurrencyAmount(order && (order.payAmount || order.totalAmount || 0))
}

function isRefundFinalized(request, order) {
    return Boolean(
        (request && (request.status === 'refunded' || request.refundProcessedAt || request.refundId)) ||
        (order && (order.status === 'refunded' || order.refundedAt || order.refundProcessedAt || order.refundId))
    )
}

function hasAcceptedRefundResult(request) {
    return Boolean(
        request && (
            request.gatewayRefundAcceptedAt ||
            request.gatewayRefundId ||
            (request.gatewayResultCode === 'SUCCESS' && request.gatewayReturnCode === 'SUCCESS')
        )
    )
}

function buildAcceptedRefundResult(request = {}) {
    return {
        refundId: request.gatewayRefundId || request.refundId || '',
        resultCode: request.gatewayResultCode || request.refundResultCode || 'SUCCESS',
        returnCode: request.gatewayReturnCode || request.refundReturnCode || 'SUCCESS'
    }
}

async function resolveCashbackUserDocIds(cashbackAdjustments) {
    const inviterUserIds = {}
    for (const inviterOpenid of Object.keys(cashbackAdjustments.byInviter || {})) {
        const user = await safeGetFirst('users', { _openid: inviterOpenid })
        if (user && user._id) inviterUserIds[inviterOpenid] = user._id
    }
    return inviterUserIds
}

async function persistAcceptedRefundResult(requestId, outRefundNo, refundResult) {
    const now = db.serverDate()
    await db.collection('refund_requests').doc(requestId).update({
        data: {
            gatewayOutRefundNo: outRefundNo,
            gatewayRefundAcceptedAt: now,
            gatewayRefundId: refundResult.refundId || '',
            gatewayResultCode: refundResult.resultCode || '',
            gatewayReturnCode: refundResult.returnCode || '',
            updatedAt: now
        }
    })
}

async function rollbackRefundingState({ requestId, orderId, outRefundNo, reason }) {
    try {
        await db.runTransaction(async transaction => {
            const currentRequestRes = await transaction.collection('refund_requests').doc(requestId).get()
            const currentOrderRes = await transaction.collection('orders').doc(orderId).get()
            const currentRequest = currentRequestRes.data || null
            const currentOrder = currentOrderRes.data || null
            if (!currentRequest || !currentOrder) return
            if (isRefundFinalized(currentRequest, currentOrder) || hasAcceptedRefundResult(currentRequest)) return
            if (currentRequest.status !== 'refunding' || currentOrder.status !== 'refunding') return
            if (outRefundNo && currentRequest.outRefundNo && currentRequest.outRefundNo !== outRefundNo) return

            const now = db.serverDate()
            await transaction.collection('refund_requests').doc(requestId).update({
                data: {
                    status: 'pending',
                    outRefundNo: '',
                    updatedAt: now,
                    lastRefundError: reason || '',
                    lastRefundFailedAt: now,
                    gatewayOutRefundNo: '',
                    gatewayRefundAcceptedAt: null,
                    gatewayRefundId: '',
                    gatewayResultCode: '',
                    gatewayReturnCode: ''
                }
            })

            await transaction.collection('orders').doc(orderId).update({
                data: {
                    status: 'refund_requested',
                    updatedAt: now,
                    refundNo: '',
                    refundId: ''
                }
            })
        })
    } catch (error) {
        console.error('回滚退款处理中状态失败:', error)
    }
}

function normalizeMemberLevel(memberLevel) {
    return MEMBER_LEVELS.includes(memberLevel) ? memberLevel : 'normal'
}

function extractPhoneNumberFromOpenApiResult(result) {
    const candidates = [
        result && result.phone_info && result.phone_info.phoneNumber,
        result && result.phone_info && result.phone_info.purePhoneNumber,
        result && result.phoneInfo && result.phoneInfo.phoneNumber,
        result && result.phoneInfo && result.phoneInfo.purePhoneNumber,
        result && result.data && result.data.phone_info && result.data.phone_info.phoneNumber,
        result && result.data && result.data.phone_info && result.data.phone_info.purePhoneNumber,
        result && result.data && result.data.phoneInfo && result.data.phoneInfo.phoneNumber,
        result && result.data && result.data.phoneInfo && result.data.phoneInfo.purePhoneNumber,
        result && result.phoneNumber,
        result && result.purePhoneNumber
    ]

    for (const item of candidates) {
        const value = String(item || '').trim()
        if (value) return value
    }
    return ''
}

function summarizePhoneOpenApiResult(result) {
    const topLevelKeys = result && typeof result === 'object' ? Object.keys(result) : []
    const phoneInfoKeys = result && result.phone_info && typeof result.phone_info === 'object'
        ? Object.keys(result.phone_info)
        : []
    const camelPhoneInfoKeys = result && result.phoneInfo && typeof result.phoneInfo === 'object'
        ? Object.keys(result.phoneInfo)
        : []
    const dataKeys = result && result.data && typeof result.data === 'object'
        ? Object.keys(result.data)
        : []
    return {
        topLevelKeys,
        dataKeys,
        phoneInfoKeys,
        camelPhoneInfoKeys
    }
}

function normalizePhoneNumberOpenApiError(error) {
    const rawCode = error && (
        error.errCode
        || error.errcode
        || error.errno
        || error.errNo
        || error.errorCode
        || error.code
    )
    const code = Number(rawCode || 0)
    const debugMsg = String(
        (error && (error.errMsg || error.message || error.msg || error.toString && error.toString()))
        || ''
    ).trim()

    if (code === 112 || /api scope is not declared in the privacy agreement/i.test(debugMsg)) {
        return {
            code: 112,
            msg: '当前版本未完成手机号相关隐私声明配置，请完善《用户隐私保护指引》后再试',
            debugMsg
        }
    }

    if (
        code === -604101
        || /function has no permission to call this api/i.test(debugMsg)
        || /system error:\s*error code:\s*-604101/i.test(debugMsg)
    ) {
        return {
            code: -604101,
            msg: '登录服务缺少手机号权限，请联系管理员',
            debugMsg
        }
    }

    if (
        /invalid code|code been used|code expired|invalid\s+phone\s+code/i.test(debugMsg)
        || (/code/i.test(debugMsg) && /(used|expired|invalid)/i.test(debugMsg))
        || /授权码.*(失效|过期|已被使用)/.test(debugMsg)
    ) {
        return {
            code: -1,
            msg: '手机号授权已失效，请重新点击授权',
            debugMsg
        }
    }

    if (
        /frequency limit|rate limit|quota limit|too many requests|busy/i.test(debugMsg)
        || /请求过于频繁/.test(debugMsg)
    ) {
        return {
            code: -1,
            msg: '当前请求过于频繁，请稍后再试',
            debugMsg
        }
    }

    return {
        code: Number.isFinite(code) && code !== 0 ? code : -1,
        msg: '获取手机号失败，请稍后重试',
        debugMsg
    }
}

function newSessionExpiresAt(baseTime = new Date()) {
    return new Date(baseTime.getTime() + AUTH_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000)
}

function isSessionExpired(session) {
    if (!session || !session.expiresAt) return true
    const expiresAt = parseSessionDate(session.expiresAt)
    if (!expiresAt) return true
    return expiresAt.getTime() <= Date.now()
}

function parseSessionDate(value) {
    if (!value) return null
    if (value instanceof Date) return value
    if (typeof value === 'object' && value.$date) return new Date(value.$date)
    return new Date(value)
}

async function markSessionExpired(session = {}) {
    if (!session._id) return
    try {
        await db.collection(AUTH_SESSION_COLLECTION).doc(session._id).update({
            data: {
                status: 'expired',
                expiredAt: db.serverDate(),
                updatedAt: db.serverDate()
            }
        })
    } catch (error) {
        console.error('标记会话过期失败:', error)
    }
}

async function refreshSession(session) {
    if (!session || !session._id) return null
    const expiresAt = newSessionExpiresAt()
    try {
        await db.collection(AUTH_SESSION_COLLECTION).doc(session._id).update({
            data: {
                lastActiveAt: db.serverDate(),
                expiresAt,
                updatedAt: db.serverDate()
            }
        })
        return { ...session, expiresAt }
    } catch (error) {
        console.error('刷新会话失败:', error)
        return null
    }
}

async function rotateSession({ openid, user, phone }) {
    const now = db.serverDate()
    const expireAt = newSessionExpiresAt(new Date())
    try {
        await db.collection(AUTH_SESSION_COLLECTION).where({
            _openid: openid,
            status: 'active'
        }).update({
            data: {
                status: 'revoked',
                revokedAt: db.serverDate(),
                updatedAt: db.serverDate()
            }
        })

        const token = `sess_${Date.now()}_${randomToken(16)}`
        const addRes = await db.collection(AUTH_SESSION_COLLECTION).add({
            data: {
                token,
                _openid: openid,
                userId: user && user._id ? user._id : '',
                phone: phone || (user && user.phone) || '',
                storeId: (user && user.storeId) || '',
                status: 'active',
                createdAt: now,
                lastActiveAt: now,
                expiresAt: expireAt,
                updatedAt: now
            }
        })
        if (!addRes._id) return null

        await db.collection('users').where({ _openid: openid }).update({
            data: {
                phoneBoundAt: user?.phoneBoundAt || now,
                loginStatus: 'logged_in',
                lastLoginAt: db.serverDate(),
                updatedAt: db.serverDate()
            }
        })

        return {
            token,
            userId: user && user._id ? user._id : '',
            expiresAt: expireAt,
            lastActiveAt: now
        }
    } catch (error) {
        console.error('会话创建失败:', error)
        return null
    }
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
