// 云函数 - payApi（微信支付 + 文档型数据库版）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const { isAuthorizedInternalCall } = require('./internal-auth')
const { buildRefundRequestPlan } = require('./refund-flow')
const { summarizeCartOrderItems } = require('./order-helpers')

function normalizeEventString(value) {
    return typeof value === 'string' ? value.trim() : ''
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

function isLikelyCloudPayNotify(event, wxContext) {
    const callerOpenid = normalizeEventString(wxContext && wxContext.OPENID)
    if (callerOpenid) return false
    if (!event || typeof event !== 'object') return false

    const outTradeNo = normalizeEventString(event.outTradeNo)
    const resultCode = normalizeEventString(event.resultCode)
    const transactionId = normalizeEventString(event.transactionId)

    if (!outTradeNo || !resultCode) return false
    if (resultCode === 'SUCCESS' && !transactionId) return false
    return true
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
            const trustedCallback = isAuthorizedInternalCall(event) || isLikelyCloudPayNotify(event, wxContext)
            if (!trustedCallback) {
                return { code: 403, msg: '无权访问' }
            }
            return await handleWxpayNotify(event)
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
    const random = String(Math.floor(Math.random() * 1000000)).padStart(6, '0')
    return `ORD${dateStr}${ms}${random}`
}

function generateVerifyCode() {
    // 8 位数字核销码
    return String(Math.floor(10000000 + Math.random() * 90000000))
}

// ─────────────────────────────────────────────
// 创建订单（不触发支付，仅生成订单记录）
// ─────────────────────────────────────────────
async function createOrder(event, openid) {
    const { productId, quantity = 1, address, remark, inviterOpenid, fissionCampaignId } = event

    const storeRes = await db.collection('stores').limit(1).get().catch(() => ({ data: [] }))
    const storeId = (storeRes.data || [])[0]?._id || ''

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
        // 库存检查（活动维度）
        if (campaign.totalStock > 0 && campaign.soldCount >= campaign.totalStock) {
            return { code: -1, msg: '活动商品已售罄' }
        }
        // 限购校验
        const bought = await db.collection('orders').where({
            _openid: openid, fissionCampaignId, status: _.neq('cancelled')
        }).count()
        if (bought.total >= (campaign.limitPerUser || 1)) {
            return { code: -1, msg: `每人限购 ${campaign.limitPerUser} 份` }
        }
        if (campaign.productId && campaign.productId !== productId) {
            return { code: -1, msg: '活动与商品不匹配' }
        }
        activityPrice = campaign.activityPrice
    }

    // 3. 商品库存预检（下单时不扣减，支付成功后才扣）
    if (product.stock !== -1 && product.stock < quantity) {
        return { code: -1, msg: '库存不足' }
    }

    const totalAmount = activityPrice * quantity
    const orderNo = generateOrderNo()
    const expireAt = new Date(Date.now() + 30 * 60 * 1000)

    // 4. 创建订单主记录
    const orderRes = await db.collection('orders').add({
        data: {
            _openid: openid, orderNo, totalAmount, payAmount: totalAmount, balanceUsed: 0,
            status: 'pending', paymentId: '',
            inviterOpenid: inviterOpenid || '',
            fissionCampaignId: fissionCampaignId || '',
            storeId,
            productId, productName: product.name, quantity,
            address: address || {}, remark: remark || '',
            createdAt: db.serverDate(), paidAt: null, completedAt: null,
            cancelledAt: null, expireAt
        }
    })

    // 5. 创建订单明细
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

    await db.collection('order_items').add({
        data: {
            _openid: openid, orderId: orderRes._id, productId,
            storeId,
            productName: product.name, productImage: (product.images || [])[0] || '',
            productType: product.type, price: activityPrice, quantity, subtotal: totalAmount,
            packageItems, packageRemaining, verifyCode, packageExpireAt,
            createdAt: db.serverDate()
        }
    })

    return {
        code: 0,
        data: {
            orderId: orderRes._id,
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
    const { outTradeNo, transactionId, resultCode } = event
    if (resultCode !== 'SUCCESS') {
        console.log('支付失败通知:', outTradeNo, resultCode)
        return { code: 0 }
    }
    // 转为内部回调处理
    return await handlePayCallback({ orderNo: outTradeNo, paymentId: transactionId })
}

// ─────────────────────────────────────────────
// 支付成功核心处理逻辑（内部调用）
// ─────────────────────────────────────────────
async function handlePayCallback(event) {
    const { orderNo, paymentId } = event
    const orderRes = await db.collection('orders').where({ orderNo }).limit(1).get()
    if (orderRes.data.length === 0) return { code: -1, msg: '订单不存在' }
    const order = orderRes.data[0]

    // CAS 更新：只有未支付订单才能更新为已支付
    const casUpdate = await db.collection('orders').doc(order._id).where({
        status: _.neq('paid')
    }).update({
        data: { status: 'paid', paymentId: paymentId || '', paidAt: db.serverDate() }
    })
    if (casUpdate.stats.updated === 0) {
        return { code: 0, msg: '已处理（幂等）' }
    }

    // 2. 【乐观锁】按订单明细扣减库存，兼容单商品和购物车订单
    const orderItemsRes = await db.collection('order_items').where({ orderId: order._id }).get().catch(() => ({ data: [] }))
    const rawOrderItems = orderItemsRes.data || []
    const itemQuantityMap = {}
    if (rawOrderItems.length > 0) {
        rawOrderItems.forEach(item => {
            const productId = item.productId
            if (!productId) return
            itemQuantityMap[productId] = (itemQuantityMap[productId] || 0) + Number(item.quantity || 0)
        })
    } else if (order.productId) {
        itemQuantityMap[order.productId] = Number(order.quantity || 1)
    }

    for (const productId of Object.keys(itemQuantityMap)) {
        const quantity = itemQuantityMap[productId]
        try {
            const product = (await db.collection('products').doc(productId).get()).data
            if (product.stock !== -1) {
                const updateRes = await db.collection('products').doc(productId).where({
                    stock: _.gte(quantity)
                }).update({
                    data: { stock: _.inc(-quantity), soldCount: _.inc(quantity) }
                })
                if (updateRes.stats.updated === 0) {
                    console.error('⚠️ 库存不足警告: 订单已付款但库存已耗尽', orderNo, productId)
                }
            } else {
                await db.collection('products').doc(productId).update({
                    data: { soldCount: _.inc(quantity) }
                })
            }
        } catch (e) {
            console.error('扣库存失败:', e)
        }
    }

    // 3. 更新裂变活动已售数
    const quantity = order.quantity || 1
    if (order.fissionCampaignId) {
        try {
            await db.collection('fission_campaigns').doc(order.fissionCampaignId).update({
                data: { soldCount: _.inc(quantity) }
            })
        } catch (e) { console.error('更新裂变计数失败:', e) }
    }

    // 4. 触发裂变返现（邀请人 ≠ 空 且 有裂变活动 且 非自邀）
    if (order.inviterOpenid && order.fissionCampaignId && order.inviterOpenid !== order._openid) {
        try {
            const result = await processFissionCashback({
                orderId: order._id,
                inviterOpenid: order.inviterOpenid,
                inviteeOpenid: order._openid,
                campaignId: order.fissionCampaignId
            })
            if (result.code !== 0 && result.code !== -1) {
                // 返现失败仅记录，不阻塞订单状态
                console.error('触发返现失败:', result)
            }
        } catch (err) { console.error('触发返现失败:', err) }
    }

    return { code: 0, msg: '支付处理完成' }
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
        return { code: 0, msg: '返现金额为0，跳过' }
    }

    const now = db.serverDate()
    const recordId = `${orderId}_${inviterOpenid}`

    try {
        await db.collection('fission_records').add({
            data: {
                _id: recordId,
                campaignId,
                inviterOpenid,
                inviteeOpenid,
                orderId,
                cashbackAmount,
                status: 'paid',
                createdAt: now
            }
        })
    } catch (e) {
        if (e && (e.errCode === -502001 || (e.message && (e.message.includes('_id_') || e.message.includes('duplicate') || e.message.includes('已存在'))))) {
            return { code: 0, msg: '已处理（幂等）' }
        }
        console.error('插入返现记录失败:', e)
        return { code: -1, msg: '返现记录创建失败' }
    }

    await db.collection('users').where({ _openid: inviterOpenid }).update({
        data: {
            balance: _.inc(cashbackAmount),
            totalEarned: _.inc(cashbackAmount),
            totalInvited: _.inc(1),
            updatedAt: now
        }
    })

    await db.collection('fission_campaigns').doc(campaignId).update({
        data: {
            newCustomers: _.inc(1),
            totalCashback: _.inc(cashbackAmount)
        }
    })

    console.log(`返现成功: ${inviterOpenid} ← ¥${(cashbackAmount / 100).toFixed(2)} (订单 ${orderId})`)
    return { code: 0, msg: '返现成功' }
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
