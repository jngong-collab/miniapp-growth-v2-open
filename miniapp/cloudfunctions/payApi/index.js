// 云函数 - payApi（微信支付 + 文档型数据库版）
const crypto = require('node:crypto')
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const internalAuth = require('./internal-auth')
const isAuthorizedInternalCall = internalAuth.isAuthorizedInternalCall || (() => false)
const { buildRefundRequestPlan } = require('./refund-flow')
const { summarizeCartOrderItems } = require('./order-helpers')

function normalizeEventString(value) {
    return typeof value === 'string' ? value.trim() : ''
}

function normalizeFlatWxpayNotify(event) {
    if (!event || typeof event !== 'object') return null

    const orderNo = normalizeEventString(event.outTradeNo)
    const resultCode = normalizeEventString(event.resultCode).toUpperCase()
    const paymentId = normalizeEventString(event.transactionId)

    if (!orderNo || !resultCode) return null
    if (resultCode === 'SUCCESS' && !paymentId) return null

    return {
        orderNo,
        paymentId,
        success: resultCode === 'SUCCESS'
    }
}

function normalizeResourceWxpayNotify(event) {
    if (!event || typeof event !== 'object' || !event.resource || typeof event.resource !== 'object') {
        return null
    }

    const eventType = normalizeEventString(event.event_type).toUpperCase()
    const tradeState = normalizeEventString(event.resource.tradeState || event.resource.trade_state).toUpperCase()
    const orderNo = normalizeEventString(event.resource.outTradeNo || event.resource.out_trade_no)
    const paymentId = normalizeEventString(event.resource.transactionId || event.resource.transaction_id)

    if (eventType && eventType !== 'TRANSACTION.SUCCESS') return null
    if (tradeState && tradeState !== 'SUCCESS') return null
    if (!orderNo || !paymentId) return null

    return {
        orderNo,
        paymentId,
        success: true
    }
}

function fallbackResolveTrustedWxpayNotify(event, wxContext) {
    const normalized = normalizeResourceWxpayNotify(event) || normalizeFlatWxpayNotify(event)
    if (!normalized) return null
    if (isAuthorizedInternalCall(event)) return normalized

    const hasConfiguredSecret = typeof internalAuth.getInternalSecret === 'function'
        ? Boolean(internalAuth.getInternalSecret())
        : false
    if (hasConfiguredSecret) return null

    const callerOpenid = normalizeEventString(wxContext && wxContext.OPENID)
    return callerOpenid ? null : normalized
}

function resolveTrustedWxpayNotify(event, wxContext, context) {
    if (typeof internalAuth.resolveTrustedWxpayNotify === 'function') {
        return internalAuth.resolveTrustedWxpayNotify(event, wxContext, context)
    }
    return fallbackResolveTrustedWxpayNotify(event, wxContext)
}

function isPayConfigComplete(payConfig) {
    if (!payConfig || payConfig.enabled === false) return false
    return Boolean(
        normalizeEventString(payConfig.mchId) &&
        normalizeEventString(payConfig.apiV3Key) &&
        normalizeEventString(payConfig.certSerialNo) &&
        normalizeEventString(payConfig.privateKey) &&
        normalizeEventString(payConfig.certificatePem)
    )
}

async function getPayConfigForStore(storeId) {
    const normalizedStoreId = normalizeEventString(storeId)
    const query = normalizedStoreId
        ? db.collection('pay_config').where({ storeId: normalizedStoreId })
        : db.collection('pay_config')
    const payConfigRes = await query.limit(1).get().catch(() => ({ data: [] }))
    const payConfig = (payConfigRes.data || [])[0] || null

    if (!payConfig || !normalizeEventString(payConfig.mchId)) {
        return { code: -1, msg: '支付功能未配置，请联系门店' }
    }

    if (!isPayConfigComplete(payConfig)) {
        return { code: -1, msg: '支付配置不完整，请在后台补充 API_V3_KEY、证书序列号、证书私钥和证书文件' }
    }

    return { code: 0, data: payConfig }
}

exports.main = async (event, context) => {
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    const { action } = event

    switch (action) {
        case 'createOrder':    return await createOrder(event, openid)
        case 'createCartOrder': return await createCartOrder(event, openid)
        case 'requestPay':     return await requestPay(event, openid)
        case 'ensureUser':
        case 'login':
        case 'initUser':
            return await ensureUser(openid, event)
        case 'payCallback': {
            // 内部鉴权：未配置环境变量时直接拒绝执行，避免默认密钥失效。
            if (!isAuthorizedInternalCall(event)) {
                return { code: 403, msg: '无权访问' }
            }
            return await handlePayCallback(event)
        }
        case 'wxpayNotify': {
            const trustedCallback = resolveTrustedWxpayNotify(event, wxContext, context)
            if (!trustedCallback) {
                return { code: 403, msg: '无权访问' }
            }
            return await handleWxpayNotify(trustedCallback)
        }
        case 'getOrder':       return await getOrder(event, openid)
        case 'getOrders':      return await getOrders(event, openid)
        case 'cancelOrder':    return await cancelOrder(event, openid)
        case 'refund':         return await handleRefund(event, openid)
        default:               return { code: -1, msg: '未知操作' }
    }
}

async function ensureUser(openid, event) {
    if (!openid) return { code: -1, msg: '缺少用户身份' }

    const invitedBy = (event || {}).invitedBy || ''
    const storeRes = await db.collection('stores').limit(1).get().catch(() => ({ data: [] }))
    const store = (storeRes.data || [])[0]
    const storeId = store ? store._id : ''

    let user = await db.collection('users').where({ _openid: openid }).limit(1).get()
        .then(res => (res.data || [])[0])
        .catch(() => null)

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
        user = await db.collection('users').doc(addRes._id).get().then(res => res.data || payload).catch(() => payload)
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

// ─────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────

function generateOrderNo() {
    const now = new Date()
    const pad = (n, l = 2) => String(n).padStart(l, '0')
    const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
    const ms = String(now.getMilliseconds()).padStart(3, '0')
    const random = crypto.randomBytes(4).toString('hex').toUpperCase()
    return `ORD${dateStr}${ms}${random}`
}

function generateVerifyCode() {
    return String(crypto.randomInt(10000000, 100000000))
}

function generateDocumentId(prefix) {
    return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`
}

function getErrorMessage(error) {
    if (!error) return ''
    if (typeof error === 'string') return error
    if (typeof error.message === 'string') return error.message
    return ''
}

function shouldProcessCashback(order) {
    return Boolean(
        order &&
        order.inviterOpenid &&
        order.fissionCampaignId &&
        order.inviterOpenid !== order._openid
    )
}

function isPaymentTerminalStatus(status) {
    return ['cancelled', 'refund_requested', 'refunding', 'refunded'].includes(status)
}

function buildInitialPostPayState(order = {}) {
    return {
        postPayStatus: 'pending',
        inventoryStatus: 'pending',
        campaignStatus: order.fissionCampaignId ? 'pending' : 'skipped',
        cashbackStatus: shouldProcessCashback(order) ? 'pending' : 'skipped',
        updatedAt: db.serverDate()
    }
}

async function getOrderByOrderNo(orderNo) {
    const orderRes = await db.collection('orders').where({ orderNo }).limit(1).get().catch(() => ({ data: [] }))
    return (orderRes.data || [])[0] || null
}

async function getUserByOpenid(openid) {
    if (!openid) return null
    const userRes = await db.collection('users').where({ _openid: openid }).limit(1).get().catch(() => ({ data: [] }))
    return (userRes.data || [])[0] || null
}

async function updateOrderDocument(orderId, data, condition = null) {
    const orderDoc = db.collection('orders').doc(orderId)
    if (condition && typeof orderDoc.where === 'function') {
        return await orderDoc.where(condition).update({ data })
    }
    if (typeof orderDoc.update === 'function') {
        return await orderDoc.update({ data })
    }
    if (typeof orderDoc.where === 'function') {
        return await orderDoc.where({}).update({ data })
    }
    throw new Error('orders update is not supported in the current runtime')
}

async function bootstrapPostPayState(order) {
    if (!order || order.postPayStatus || order.status !== 'paid') return order

    await db.collection('orders').doc(order._id).where({
        status: 'paid'
    }).update({
        data: buildInitialPostPayState(order)
    }).catch(() => null)

    return await getOrderByOrderNo(order.orderNo) || order
}

async function markPostPayDone(orderId) {
    await updateOrderDocument(orderId, {
        postPayStatus: 'done',
        paymentProcessedAt: db.serverDate(),
        postPayLastError: '',
        updatedAt: db.serverDate()
    })
}

async function releasePostPayForRetry(orderId, errorMessage) {
    await updateOrderDocument(orderId, {
        postPayStatus: 'pending',
        postPayLastError: (errorMessage || '').slice(0, 120),
        updatedAt: db.serverDate()
    }).catch(() => null)
}

async function claimPostPayProcessing(order) {
    const normalizedOrder = await bootstrapPostPayState(order)

    if (!normalizedOrder) return { status: 'missing', order: null }
    if (normalizedOrder.paymentProcessedAt || normalizedOrder.postPayStatus === 'done') {
        return { status: 'done', order: normalizedOrder }
    }
    if (normalizedOrder.postPayStatus === 'processing') {
        return { status: 'processing', order: normalizedOrder }
    }
    if (normalizedOrder.postPayStatus === 'refund_requested') {
        return { status: 'refund_requested', order: normalizedOrder }
    }

    const claimRes = await db.collection('orders').doc(normalizedOrder._id).where({
        status: 'paid',
        postPayStatus: 'pending'
    }).update({
        data: {
            postPayStatus: 'processing',
            postPayProcessingAt: db.serverDate(),
            updatedAt: db.serverDate()
        }
    }).catch(() => ({ stats: { updated: 0 } }))

    if ((claimRes.stats || {}).updated > 0) {
        return {
            status: 'claimed',
            order: {
                ...normalizedOrder,
                postPayStatus: 'processing'
            }
        }
    }

    const freshOrder = await getOrderByOrderNo(normalizedOrder.orderNo)
    if (!freshOrder) return { status: 'missing', order: null }
    if (freshOrder.paymentProcessedAt || freshOrder.postPayStatus === 'done') {
        return { status: 'done', order: freshOrder }
    }
    if (freshOrder.postPayStatus === 'processing') {
        return { status: 'processing', order: freshOrder }
    }
    return { status: 'retry', order: freshOrder }
}

async function ensureOrderMarkedPaid(order, paymentId) {
    if (!order) return { code: -1, msg: '订单不存在' }

    if (order.status === 'pending') {
        const nextState = {
            status: 'paid',
            paymentId: paymentId || order.paymentId || '',
            paidAt: db.serverDate(),
            ...buildInitialPostPayState(order)
        }
        const casUpdate = await db.collection('orders').doc(order._id).where({
            status: 'pending'
        }).update({
            data: nextState
        }).catch(() => ({ stats: { updated: 0 } }))

        if (casUpdate.stats.updated === 0) {
            const freshOrder = await getOrderByOrderNo(order.orderNo)
            if (freshOrder) {
                order = freshOrder
            }
        } else {
            return {
                code: 0,
                order: {
                    ...order,
                    ...nextState
                }
            }
        }
    }

    if (order.status === 'paid') {
        if (paymentId && !normalizeEventString(order.paymentId)) {
            await updateOrderDocument(order._id, {
                paymentId,
                updatedAt: db.serverDate()
            }).catch(() => null)
            order.paymentId = paymentId
        }
        return { code: 0, order: await bootstrapPostPayState(order) }
    }

    if (order.status === 'cancelled' && paymentId) {
        await markOrderForUnexpectedPayment(order, '订单取消后收到支付回调，系统自动发起退款', paymentId)
        return { code: 0, msg: '订单已取消，已自动转入退款流程', ignore: true, order }
    }

    if (isPaymentTerminalStatus(order.status)) {
        return { code: 0, msg: '订单已终止，忽略回调', ignore: true, order }
    }

    return { code: -1, msg: '订单状态不支持支付回调', order }
}

async function loadOrderItems(orderId) {
    const orderItemsRes = await db.collection('order_items').where({ orderId }).get().catch(() => ({ data: [] }))
    return orderItemsRes.data || []
}

function buildItemQuantityMap(order, orderItems) {
    const itemQuantityMap = {}
    if ((orderItems || []).length > 0) {
        orderItems.forEach(item => {
            const productId = item.productId
            if (!productId) return
            itemQuantityMap[productId] = (itemQuantityMap[productId] || 0) + Number(item.quantity || 0)
        })
        return itemQuantityMap
    }

    if (order && order.productId) {
        itemQuantityMap[order.productId] = Number(order.quantity || 1)
    }
    return itemQuantityMap
}

async function deductInventoryAfterPayment(order) {
    if (!order || order.inventoryStatus === 'done') {
        return { code: 0 }
    }

    const rawOrderItems = await loadOrderItems(order._id)
    const itemQuantityMap = buildItemQuantityMap(order, rawOrderItems)

    for (const productId of Object.keys(itemQuantityMap)) {
        const quantity = itemQuantityMap[productId]
        try {
            const product = (await db.collection('products').doc(productId).get()).data
            if (!product) {
                return { code: -1, msg: `商品不存在: ${productId}` }
            }

            if (Number(product.stock) !== -1) {
                const updateRes = await db.collection('products').doc(productId).where({
                    stock: _.gte(quantity)
                }).update({
                    data: { stock: _.inc(-quantity), soldCount: _.inc(quantity) }
                })

                if ((updateRes.stats || {}).updated === 0) {
                    return { code: -1, msg: `库存不足: ${productId}` }
                }
            } else {
                await db.collection('products').doc(productId).update({
                    data: { soldCount: _.inc(quantity) }
                })
            }
        } catch (error) {
            return { code: -1, msg: getErrorMessage(error) || `库存扣减失败: ${productId}` }
        }
    }

    await updateOrderDocument(order._id, {
        inventoryStatus: 'done',
        inventoryDeductedAt: db.serverDate(),
        updatedAt: db.serverDate()
    })

    return { code: 0 }
}

async function markOrderForInventoryRefund(order, reason) {
    const now = db.serverDate()
    const refundReason = reason || '支付成功后库存扣减失败，系统自动发起退款'
    const refundPlan = buildRefundRequestPlan({
        orderId: order._id,
        orderNo: order.orderNo || '',
        requesterOpenid: order._openid || '',
        previousStatus: 'paid',
        refundAmount: order.payAmount || order.totalAmount || 0,
        reason: refundReason
    }, now)
    const refundRequestId = `auto_stock_refund_${order._id}`
    const existingRequestRes = await db.collection('refund_requests').where({
        orderId: order._id,
        status: _.in(['pending', 'refunding', 'refunded'])
    }).limit(1).get().catch(() => ({ data: [] }))
    const existingRequest = (existingRequestRes.data || [])[0] || null

    await db.runTransaction(async transaction => {
        const currentOrderRes = await transaction.collection('orders').doc(order._id).get()
        const currentOrder = currentOrderRes.data || order

        const orderUpdate = {
            ...refundPlan.orderUpdate,
            inventoryStatus: 'failed',
            postPayStatus: 'refund_requested',
            paymentProcessedAt: now,
            postPayLastError: refundReason.slice(0, 120)
        }

        if (isPaymentTerminalStatus(currentOrder.status)) {
            await transaction.collection('orders').doc(order._id).update({
                data: orderUpdate
            })
            return
        }

        await transaction.collection('orders').doc(order._id).update({
            data: orderUpdate
        })

        if (existingRequest) return

        const currentRequestRes = await transaction.collection('refund_requests').doc(refundRequestId).get().catch(() => ({ data: null }))
        if (currentRequestRes && currentRequestRes.data) return

        await transaction.collection('refund_requests').add({
            data: {
                _id: refundRequestId,
                ...refundPlan.refundRequestData,
                source: 'system_auto_inventory',
                storeId: order.storeId || ''
            }
        })
    })
}

async function markOrderForUnexpectedPayment(order, reason, paymentId = '') {
    const now = db.serverDate()
    const refundReason = reason || '订单状态异常但收到支付回调，系统自动发起退款'
    const refundPlan = buildRefundRequestPlan({
        orderId: order._id,
        orderNo: order.orderNo || '',
        requesterOpenid: order._openid || '',
        previousStatus: order.status || 'paid',
        refundAmount: order.payAmount || order.totalAmount || 0,
        reason: refundReason
    }, now)
    const refundRequestId = `auto_unexpected_pay_${order._id}`
    const existingRequestRes = await db.collection('refund_requests').where({
        orderId: order._id,
        status: _.in(['pending', 'refunding', 'refunded'])
    }).limit(1).get().catch(() => ({ data: [] }))
    const existingRequest = (existingRequestRes.data || [])[0] || null

    await db.runTransaction(async transaction => {
        await transaction.collection('orders').doc(order._id).update({
            data: {
                ...refundPlan.orderUpdate,
                paymentId: paymentId || order.paymentId || '',
                postPayStatus: 'refund_requested',
                paymentProcessedAt: now,
                postPayLastError: refundReason.slice(0, 120)
            }
        })

        if (existingRequest) return

        const currentRequestRes = await transaction.collection('refund_requests').doc(refundRequestId).get().catch(() => ({ data: null }))
        if (currentRequestRes && currentRequestRes.data) return

        await transaction.collection('refund_requests').add({
            data: {
                _id: refundRequestId,
                ...refundPlan.refundRequestData,
                source: 'system_unexpected_payment',
                storeId: order.storeId || ''
            }
        })
    })
}

async function incrementCampaignSoldCount(order) {
    if (!order || !order.fissionCampaignId || order.campaignStatus === 'done') {
        return { code: 0 }
    }

    let campaign
    try {
        campaign = (await db.collection('fission_campaigns').doc(order.fissionCampaignId).get()).data
    } catch (error) {
        return { code: -1, msg: '活动不存在' }
    }
    if (!campaign) {
        return { code: -1, msg: '活动不存在' }
    }

    const quantity = Number(order.quantity || 1)

    if (campaign.totalStock !== -1) {
        const campaignUpdateRes = await db.collection('fission_campaigns').doc(campaign._id).where({
            soldCount: _.lte(campaign.totalStock - quantity)
        }).update({
            data: { soldCount: _.inc(quantity), updatedAt: db.serverDate() }
        })
        if ((campaignUpdateRes.stats || {}).updated === 0) {
            return { code: -1, msg: '活动库存不足' }
        }
    } else {
        await db.collection('fission_campaigns').doc(campaign._id).update({
            data: { soldCount: _.inc(quantity), updatedAt: db.serverDate() }
        })
    }

    await updateOrderDocument(order._id, {
        campaignStatus: 'done',
        campaignCountedAt: db.serverDate(),
        updatedAt: db.serverDate()
    })

    return { code: 0 }
}

async function markCashbackDone(orderId) {
    await updateOrderDocument(orderId, {
        cashbackStatus: 'done',
        cashbackProcessedAt: db.serverDate(),
        updatedAt: db.serverDate()
    })
}

// ─────────────────────────────────────────────
// 裂变活动累计购买数量统计（分页累计，避免单页上限漏算）
// ─────────────────────────────────────────────
async function countExistingPurchaseQuantity(openid, fissionCampaignId, querySource = db) {
    const pageSize = 1000
    let offset = 0
    let totalQuantity = 0

    while (true) {
        const res = await querySource.collection('orders').where({
            _openid: openid,
            fissionCampaignId,
            status: _.neq('cancelled')
        }).skip(offset).limit(pageSize).get()

        const data = res.data || []
        if (!data.length) break

        totalQuantity += data.reduce((sum, o) => sum + Number(o.quantity || 0), 0)
        offset += data.length

        if (data.length < pageSize) break
    }

    return totalQuantity
}

async function createFissionOrderWithLimitGuard({
    openid,
    fissionCampaignId,
    normalizedQuantity,
    limitPerUser,
    orderId,
    orderNo,
    totalAmount,
    orderData,
    orderItemId,
    orderItemData
}) {
    try {
        await db.runTransaction(async transaction => {
            const existingQuantity = await countExistingPurchaseQuantity(openid, fissionCampaignId, transaction)
            if (existingQuantity + normalizedQuantity > limitPerUser) {
                throw new Error('FISSION_LIMIT_EXCEEDED')
            }

            await transaction.collection('orders').doc(orderId).set({
                data: orderData
            })

            await transaction.collection('order_items').doc(orderItemId).set({
                data: orderItemData
            })
        })
    } catch (error) {
        if (getErrorMessage(error) === 'FISSION_LIMIT_EXCEEDED') {
            return { code: -1, msg: `每人限购 ${limitPerUser} 份` }
        }
        throw error
    }

    return {
        code: 0,
        data: {
            orderId,
            orderNo,
            payAmount: totalAmount,
            payAmountYuan: (totalAmount / 100).toFixed(2)
        }
    }
}

// ─────────────────────────────────────────────
// 创建订单（不触发支付，仅生成订单记录）
// ─────────────────────────────────────────────
async function createOrder(event, openid) {
    const { productId, quantity = 1, address, remark, fissionCampaignId } = event
    const normalizedQuantity = Number.parseInt(quantity, 10)
    if (!Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0) {
        return { code: -1, msg: '购买数量无效' }
    }

    const storeRes = await db.collection('stores').limit(1).get().catch(() => ({ data: [] }))
    const storeId = (storeRes.data || [])[0]?._id || ''
    const user = await getUserByOpenid(openid)
    const inviterOpenid = normalizeEventString(user && user.inviterOpenid)

    // 1. 查商品
    let product
    try { product = (await db.collection('products').doc(productId).get()).data }
    catch (e) { return { code: -1, msg: '商品不存在或已下架' } }
    if (!product || product.status !== 'on') return { code: -1, msg: '商品已下架' }

    // 2. 裂变活动检查
    let activityPrice = product.price
    let campaign = null
    if (fissionCampaignId) {
        try { campaign = (await db.collection('fission_campaigns').doc(fissionCampaignId).get()).data }
        catch (e) { return { code: -1, msg: '活动不存在' } }

        if (campaign.status !== 'active') return { code: -1, msg: '活动已结束' }
        const now = new Date()
        if (now < new Date(campaign.startTime) || now > new Date(campaign.endTime)) {
            return { code: -1, msg: '活动不在有效期内' }
        }
        // 限购校验会在事务内与订单创建一起完成，避免并发请求同时穿过额度检查。
        // 库存预检（只读检查，支付成功后才原子扣减，避免未支付订单锁死库存）
        if (campaign.totalStock !== -1) {
            const currentSold = Number(campaign.soldCount || 0)
            if (currentSold + normalizedQuantity > campaign.totalStock) {
                return { code: -1, msg: '活动商品已售罄' }
            }
        }
        if (campaign.productId && campaign.productId !== productId) {
            return { code: -1, msg: '活动与商品不匹配' }
        }
        activityPrice = campaign.activityPrice
    }

    // 3. 商品库存预检（下单时不扣减，支付成功后才扣）
    if (product.stock !== -1 && product.stock < normalizedQuantity) {
        return { code: -1, msg: '库存不足' }
    }

    const totalAmount = Number(activityPrice || 0) * normalizedQuantity
    const orderNo = generateOrderNo()
    const expireAt = new Date(Date.now() + 30 * 60 * 1000)
    const orderId = generateDocumentId('order')

    const orderData = {
        _openid: openid, orderNo, totalAmount, payAmount: totalAmount, balanceUsed: 0,
        status: 'pending', paymentId: '',
        inviterOpenid: inviterOpenid && inviterOpenid !== openid ? inviterOpenid : '',
        fissionCampaignId: fissionCampaignId || '',
        storeId,
        productId, productName: product.name, quantity: normalizedQuantity,
        address: address || {}, remark: remark || '',
        createdAt: db.serverDate(), paidAt: null, completedAt: null,
        cancelledAt: null, expireAt
    }

    // 4. 创建订单明细
    const needVerifyCode = (product.type === 'service' || product.type === 'package')
    const verifyCode = needVerifyCode ? generateVerifyCode() : ''
    let packageItems = null
    let packageRemaining = null
    let packageExpireAt = null
    if (product.type === 'package') {
        const pkgRes = await db.collection('packages').where({ productId }).limit(1).get()
        if (pkgRes.data.length > 0) {
            packageItems = pkgRes.data[0].items
            packageRemaining = {}
            pkgRes.data[0].items.forEach(it => { packageRemaining[it.name] = it.count })
            const validDays = pkgRes.data[0].validDays || 0
            if (validDays > 0) {
                packageExpireAt = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000)
            }
        }
    }

    const orderItemId = generateDocumentId('order_item')
    const orderItemData = {
        _openid: openid, orderId, productId,
        storeId,
        productName: product.name, productImage: (product.images || [])[0] || '',
        productType: product.type, price: activityPrice, quantity: normalizedQuantity, subtotal: totalAmount,
        packageItems, packageRemaining, verifyCode, packageExpireAt,
        createdAt: db.serverDate()
    }

    if (fissionCampaignId) {
        return await createFissionOrderWithLimitGuard({
            openid,
            fissionCampaignId,
            normalizedQuantity,
            limitPerUser: Number(campaign.limitPerUser || 1),
            orderId,
            orderNo,
            totalAmount,
            orderData,
            orderItemId,
            orderItemData
        })
    }

    // 5. 创建订单主记录与明细
    await db.collection('orders').doc(orderId).set({
        data: orderData
    })

    await db.collection('order_items').doc(orderItemId).set({
        data: orderItemData
    })

    return {
        code: 0,
        data: {
            orderId,
            orderNo,
            payAmount: totalAmount,
            payAmountYuan: (totalAmount / 100).toFixed(2)
        }
    }
}

async function createCartOrder(event, openid) {
    const rawItems = Array.isArray(event.items) ? event.items : []
    if (!rawItems.length) return { code: -1, msg: '请选择要结算的商品' }

    const storeRes = await db.collection('stores').limit(1).get().catch(() => ({ data: [] }))
    const storeId = (storeRes.data || [])[0]?._id || ''

    const mergedItemsMap = new Map()
    rawItems.forEach(item => {
        const productId = item && item.productId ? String(item.productId) : ''
        const quantity = Number.parseInt(item && item.quantity, 10)
        if (!productId || !Number.isFinite(quantity) || quantity <= 0) return
        mergedItemsMap.set(productId, (mergedItemsMap.get(productId) || 0) + quantity)
    })

    const normalizedItems = Array.from(mergedItemsMap.entries()).map(([productId, quantity]) => ({ productId, quantity }))
    if (!normalizedItems.length) return { code: -1, msg: '购物车商品无效' }

    const productIds = normalizedItems.map(item => item.productId)
    const productsRes = await db.collection('products').where({
        _id: _.in(productIds)
    }).get().catch(() => ({ data: [] }))
    const products = productsRes.data || []
    const productMap = {}
    products.forEach(product => {
        productMap[product._id] = product
    })

    for (const productId of productIds) {
        if (!productMap[productId]) {
            return { code: -1, msg: '购物车中存在已失效商品，请刷新后重试' }
        }
    }

    const now = new Date()
    const campaignsRes = await db.collection('fission_campaigns').where({
        productId: _.in(productIds),
        status: 'active',
        startTime: _.lte(now),
        endTime: _.gte(now)
    }).get().catch(() => ({ data: [] }))
    const campaignProductIdSet = new Set((campaignsRes.data || []).map(item => item.productId))

    const orderItems = []
    for (const item of normalizedItems) {
        const product = productMap[item.productId]
        if (!product || product.status !== 'on') {
            return { code: -1, msg: '购物车中存在已下架商品，请刷新后重试' }
        }
        if (product.type !== 'physical') {
            return { code: -1, msg: '仅普通实物商品支持加入购物车' }
        }
        if (campaignProductIdSet.has(item.productId)) {
            return { code: -1, msg: '活动商品请直接购买' }
        }
        if (product.stock !== -1 && product.stock < item.quantity) {
            return { code: -1, msg: `${product.name} 库存不足` }
        }

        orderItems.push({
            productId: product._id,
            productName: product.name,
            productImage: (product.images || [])[0] || '',
            productType: product.type,
            price: product.price,
            quantity: item.quantity,
            subtotal: product.price * item.quantity,
            packageItems: null,
            packageRemaining: null,
            verifyCode: ''
        })
    }

    const summary = summarizeCartOrderItems(orderItems)
    const orderNo = generateOrderNo()
    const expireAt = new Date(Date.now() + 30 * 60 * 1000)

    const orderRes = await db.collection('orders').add({
        data: {
            _openid: openid,
            orderNo,
            totalAmount: summary.totalAmount,
            payAmount: summary.totalAmount,
            balanceUsed: 0,
            status: 'pending',
            paymentId: '',
            inviterOpenid: '',
            fissionCampaignId: '',
            storeId,
            productId: '',
            productName: summary.productName,
            quantity: summary.totalQuantity,
            itemCount: summary.itemCount,
            orderType: 'cart',
            address: event.address || {},
            remark: event.remark || '',
            createdAt: db.serverDate(),
            paidAt: null,
            completedAt: null,
            cancelledAt: null,
            expireAt
        }
    })

    await Promise.all(orderItems.map(item => db.collection('order_items').add({
        data: {
            _openid: openid,
            orderId: orderRes._id,
            storeId,
            ...item,
            createdAt: db.serverDate()
        }
    })))

    return {
        code: 0,
        data: {
            orderId: orderRes._id,
            orderNo,
            payAmount: summary.totalAmount,
            payAmountYuan: (summary.totalAmount / 100).toFixed(2)
        }
    }
}

// ─────────────────────────────────────────────
// 发起微信支付（调用 cloud.cloudPay 或 cloud.callCloudFunction）
// ─────────────────────────────────────────────
async function requestPay(event, openid) {
    const { orderId } = event
    if (!orderId) return { code: -1, msg: '缺少订单ID' }

    let order
    try { order = (await db.collection('orders').doc(orderId).get()).data }
    catch (e) { return { code: -1, msg: '订单不存在' } }

    if (order._openid !== openid) return { code: -1, msg: '无权操作' }
    if (order.status === 'paid') return { code: -1, msg: '订单已支付' }
    if (order.status === 'cancelled') return { code: -1, msg: '订单已取消' }

    // 检查订单是否过期
    if (order.expireAt && new Date() > new Date(order.expireAt)) {
        await db.collection('orders').doc(orderId).update({
            data: { status: 'cancelled', cancelledAt: db.serverDate() }
        })
        return { code: -1, msg: '订单已超时，请重新下单' }
    }

    // 读取支付配置
    const payConfigResult = await getPayConfigForStore(order.storeId)
    if (payConfigResult.code !== 0) {
        return payConfigResult
    }
    const payConfig = payConfigResult.data

    try {
        // 使用微信云开发内置云支付（推荐方式）
        // 文档：https://developers.weixin.qq.com/miniprogram/dev/wxcloud/guide/pay/pay.html
        const payRes = await cloud.cloudPay.unifiedOrder({
            functionName: 'payApi',         // 支付结果回调的云函数名
            envId: cloud.DYNAMIC_CURRENT_ENV,
            subMchId: payConfig.mchId,       // 商户号
            nonceStr: Math.random().toString(36).slice(2),
            body: order.productName || '商品购买',
            outTradeNo: order.orderNo,
            spbillCreateIp: '127.0.0.1',
            totalFee: order.payAmount,       // 单位：分
            timeExpire: formatPayExpire(order.expireAt),
            openid: openid
        })

        if (payRes.returnCode !== 'SUCCESS' || payRes.resultCode !== 'SUCCESS') {
            console.error('支付下单失败:', payRes)
            return { code: -1, msg: payRes.errCodeDes || '支付发起失败' }
        }

        return {
            code: 0,
            data: {
                orderId,
                orderNo: order.orderNo,
                payAmount: order.payAmount,
                // 前端 wx.requestPayment 所需参数
                payment: {
                    timeStamp: payRes.timeStamp,
                    nonceStr: payRes.nonceStr,
                    package: payRes.package,
                    signType: payRes.signType,
                    paySign: payRes.paySign
                }
            }
        }
    } catch (err) {
        console.error('云支付调用失败:', err)
        // 如果未开通云支付，返回提示
        if (err.message && err.message.includes('cloudPay')) {
            return { code: -2, msg: '请在云开发控制台开通"云支付"功能并绑定商户号' }
        }
        return { code: -1, msg: `支付发起异常: ${err.message}` }
    }
}

// ─────────────────────────────────────────────
// 微信支付结果回调（由云支付自动调用此云函数的 wxpayNotify action）
// ─────────────────────────────────────────────
async function handleWxpayNotify(event) {
    if (!event || !event.orderNo) return { code: -1, msg: '支付通知无效' }
    if (event.success === false) {
        console.log('支付失败通知:', event.orderNo)
        return { code: 0 }
    }
    return await handlePayCallback({ orderNo: event.orderNo, paymentId: event.paymentId })
}

// ─────────────────────────────────────────────
// 支付成功核心处理逻辑（内部调用）
// ─────────────────────────────────────────────
async function handlePayCallback(event) {
    const orderNo = normalizeEventString(event && event.orderNo)
    const paymentId = normalizeEventString(event && event.paymentId)
    if (!orderNo) return { code: -1, msg: '缺少订单号' }

    const order = await getOrderByOrderNo(orderNo)
    if (!order) return { code: -1, msg: '订单不存在' }

    const payState = await ensureOrderMarkedPaid(order, paymentId)
    if (payState.code !== 0) {
        return payState
    }
    if (payState.ignore) {
        return { code: 0, msg: payState.msg || '订单已终止，忽略回调' }
    }

    let currentOrder = payState.order || order
    while (true) {
        const claimState = await claimPostPayProcessing(currentOrder)
        if (claimState.status === 'done') {
            return { code: 0, msg: '支付处理完成' }
        }
        if (claimState.status === 'processing') {
            return { code: 0, msg: '已处理（幂等）' }
        }
        if (claimState.status === 'refund_requested') {
            return { code: 0, msg: '库存扣减失败，已转入退款' }
        }
        if (claimState.status === 'missing') {
            return { code: -1, msg: '订单不存在' }
        }
        if (claimState.status === 'retry' && claimState.order) {
            currentOrder = claimState.order
            continue
        }
        if (claimState.status !== 'claimed') {
            return { code: -1, msg: '支付后处理状态异常' }
        }
        currentOrder = claimState.order || currentOrder
        break
    }

    try {
        const inventoryResult = await deductInventoryAfterPayment(currentOrder)
        if (inventoryResult.code !== 0) {
            await markOrderForInventoryRefund(currentOrder, inventoryResult.msg || '支付成功后库存扣减失败，系统自动发起退款')
            return { code: 0, msg: '库存扣减失败，已转入退款' }
        }

        await incrementCampaignSoldCount(currentOrder)

        if (shouldProcessCashback(currentOrder) && currentOrder.cashbackStatus !== 'done') {
            const cashbackResult = await processFissionCashback({
                orderId: currentOrder._id,
                inviterOpenid: currentOrder.inviterOpenid,
                inviteeOpenid: currentOrder._openid,
                campaignId: currentOrder.fissionCampaignId
            })
            if (cashbackResult.code !== 0) {
                throw new Error(cashbackResult.msg || '裂变返现失败')
            }
            await markCashbackDone(currentOrder._id)
        }

        await markPostPayDone(currentOrder._id)
        return { code: 0, msg: '支付处理完成' }
    } catch (error) {
        const errorMessage = getErrorMessage(error) || '支付后处理失败'
        await releasePostPayForRetry(currentOrder._id, errorMessage)
        console.error('pay callback post-processing failed:', orderNo, errorMessage)
        return { code: -1, msg: '支付后处理失败' }
    }
}

async function processFissionCashback({ orderId, inviterOpenid, inviteeOpenid, campaignId }) {
    if (!orderId || !inviterOpenid || !inviteeOpenid || !campaignId) {
        return { code: -1, msg: '参数不完整' }
    }
    if (inviterOpenid === inviteeOpenid) {
        return { code: 0, msg: '同用户邀请，忽略返现' }
    }

    let campaign
    try {
        campaign = (await db.collection('fission_campaigns').doc(campaignId).get()).data
    } catch (error) {
        return { code: -1, msg: '活动无效' }
    }
    if (!campaign || campaign.status !== 'active') {
        return { code: -1, msg: '活动未生效' }
    }

    const cashbackAmount = Number(campaign.cashbackAmount || 0)
    if (cashbackAmount <= 0) {
        return { code: 0, msg: '返现金额为 0，跳过' }
    }

    const inviterUser = await getUserByOpenid(inviterOpenid)
    if (!inviterUser || !inviterUser._id) {
        return { code: -1, msg: '邀请人不存在' }
    }

    const now = db.serverDate()
    const recordId = `${orderId}_${inviterOpenid}`

    try {
        let transactionResult = { code: 0, msg: '返现成功' }
        await db.runTransaction(async transaction => {
            const existingRecordRes = await transaction.collection('fission_records').doc(recordId).get().catch(() => ({ data: null }))
            const existingRecord = existingRecordRes && existingRecordRes.data
            if (existingRecord) {
                transactionResult = { code: 0, msg: '已处理（幂等）' }
                return
            }

            await transaction.collection('fission_records').add({
                data: {
                    _id: recordId,
                    campaignId,
                    inviterOpenid,
                    inviteeOpenid,
                    orderId,
                    cashbackAmount,
                    status: 'paid',
                    createdAt: now,
                    updatedAt: now
                }
            })

            await transaction.collection('users').doc(inviterUser._id).update({
                data: {
                    balance: _.inc(cashbackAmount),
                    totalEarned: _.inc(cashbackAmount),
                    totalInvited: _.inc(1),
                    updatedAt: now
                }
            })

            await transaction.collection('fission_campaigns').doc(campaignId).update({
                data: {
                    newCustomers: _.inc(1),
                    totalCashback: _.inc(cashbackAmount),
                    updatedAt: now
                }
            })
        })
        return transactionResult
    } catch (error) {
        if (error && (error.errCode === -502001 || /_id_|duplicate|已存在/i.test(error.message || ''))) {
            return { code: 0, msg: '已处理（幂等）' }
        }
        console.error('fission cashback failed:', orderId, getErrorMessage(error))
        return { code: -1, msg: '返现处理失败' }
    }
}

// ─────────────────────────────────────────────
// 查询单笔订单
// ─────────────────────────────────────────────

async function getOrder(event, openid) {
    try {
        const order = (await db.collection('orders').doc(event.orderId).get()).data
        if (order._openid !== openid) return { code: -1, msg: '无权限' }
        const items = await db.collection('order_items').where({ orderId: event.orderId }).get()
        order.items = items.data
        return { code: 0, data: order }
    } catch (e) { return { code: -1, msg: '订单不存在' } }
}

// ─────────────────────────────────────────────
// 查询订单列表
// ─────────────────────────────────────────────
async function getOrders(event, openid) {
    const { status, page = 1, pageSize = 10 } = event
    const condition = { _openid: openid }
    if (status && status !== 'all') condition.status = status
    const res = await db.collection('orders').where(condition)
        .orderBy('createdAt', 'desc').skip((page - 1) * pageSize).limit(pageSize).get()
    return { code: 0, data: res.data }
}

// ─────────────────────────────────────────────
// 主动取消未支付订单
// ─────────────────────────────────────────────
async function cancelOrder(event, openid) {
    const { orderId } = event
    if (!orderId) return { code: -1, msg: '缺少订单ID' }
    try {
        const order = (await db.collection('orders').doc(orderId).get()).data
        if (order._openid !== openid) return { code: -1, msg: '无权操作' }
        if (order.status !== 'pending') return { code: -1, msg: '只能取消待支付的订单' }
        await db.collection('orders').doc(orderId).update({
            data: { status: 'cancelled', cancelledAt: db.serverDate() }
        })
        return { code: 0, msg: '订单已取消' }
    } catch (e) { return { code: -1, msg: '操作失败' } }
}

// ─────────────────────────────────────────────
// 申请退款（回退库存、返现、活动计数）
// ─────────────────────────────────────────────
async function handleRefund(event, openid) {
    const { orderId, reason } = event
    if (!orderId) return { code: -1, msg: '缺少订单ID' }
    try {
        const order = (await db.collection('orders').doc(orderId).get()).data
        if (order._openid !== openid) return { code: -1, msg: '无权操作' }
        if (order.status !== 'paid') return { code: -1, msg: '订单状态不支持退款' }

        const existingRequestRes = await db.collection('refund_requests').where({
            orderId,
            status: _.in(['pending', 'approved', 'refunded'])
        }).limit(1).get().catch(() => ({ data: [] }))
        if ((existingRequestRes.data || []).length > 0) {
            return { code: -1, msg: '该订单已提交退款申请' }
        }

        const refundPlan = buildRefundRequestPlan({
            orderId,
            orderNo: order.orderNo || '',
            requesterOpenid: openid,
            previousStatus: order.status || 'paid',
            refundAmount: order.payAmount || order.totalAmount || 0,
            reason
        }, db.serverDate())

        await db.runTransaction(async transaction => {
            await transaction.collection('orders').doc(orderId).update({
                data: refundPlan.orderUpdate
            })
            await transaction.collection('refund_requests').add({
                data: { ...refundPlan.refundRequestData, storeId: order.storeId || '' }
            })
        })

        return { code: 0, msg: '退款申请已提交，门店将尽快处理' }
    } catch (e) {
        console.error('退款处理失败:', e)
        return { code: -1, msg: '操作失败' }
    }
}

// ─────────────────────────────────────────────
// 工具：格式化支付过期时间 yyyyMMddHHmmss
// ─────────────────────────────────────────────
function formatPayExpire(expireAt) {
    if (!expireAt) return ''
    const d = new Date(expireAt)
    const pad = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}
