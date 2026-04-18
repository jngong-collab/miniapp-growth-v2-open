const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
    const { OPENID } = cloud.getWXContext()
    const { action } = event

    switch (action) {
        case 'getProductDetail':
            return getProductDetail(event)
        case 'ensureUser':
        case 'login':
        case 'initUser':
            return proxyPayApi({ ...event, action: 'ensureUser' })
        case 'createOrder':
            return proxyPayApi({ ...event, action: 'createOrder' })
        case 'createCartOrder':
            return proxyPayApi({ ...event, action: 'createCartOrder' })
        case 'requestPay':
            return proxyPayApi({ ...event, action: 'requestPay' })
        case 'getMyOrders':
            return getMyOrders(event, OPENID)
        case 'getMyOrderCounts':
            return getMyOrderCounts(OPENID)
        case 'requestRefund':
            return requestRefund(event, OPENID)
        default:
            return { code: -1, msg: '未知操作' }
    }
}

async function getProductDetail(event) {
    const { productId } = event
    if (!productId) return { code: -1, msg: '缺少商品ID' }

    let product
    try {
        product = (await db.collection('products').doc(productId).get()).data
    } catch (error) {
        return { code: -1, msg: '商品不存在' }
    }

    if (!product || product.status !== 'on') {
        return { code: -1, msg: '商品已下架' }
    }

    const now = new Date()
    const [campaignsRes, packageRes] = await Promise.all([
        db.collection('fission_campaigns').where({
            productId,
            status: 'active',
            startTime: _.lte(now),
            endTime: _.gte(now)
        }).limit(1).get().catch(() => ({ data: [] })),
        db.collection('packages').where({ productId }).limit(1).get().catch(() => ({ data: [] }))
    ])

    product = await resolveProductImages(product)

    return {
        code: 0,
        data: {
            product,
            campaign: campaignsRes.data[0] || null,
            packageDetail: packageRes.data[0] || null
        }
    }
}

async function resolveProductImages(product) {
    if (!product || !Array.isArray(product.images) || !product.images.length) return product
    const cloudImages = product.images.filter(item => item && String(item).startsWith('cloud://'))
    if (!cloudImages.length) return product

    try {
        const res = await cloud.getTempFileURL({ fileList: [...new Set(cloudImages)] })
        const fileMap = (res.fileList || []).reduce((acc, item) => {
            if (item.fileID && item.tempFileURL) {
                acc[item.fileID] = item.tempFileURL
            }
            return acc
        }, {})
        return {
            ...product,
            images: product.images.map(item => fileMap[item] || item)
        }
    } catch (error) {
        console.error('commerceApi 转换商品图片失败:', error)
        return product
    }
}

async function getMyOrders(event, openid) {
    const { status = 'all', page = 1, pageSize = 30 } = event
    const condition = { _openid: openid }
    const statusCondition = buildOrderStatusCondition(status)
    if (statusCondition !== null) condition.status = statusCondition

    const ordersRes = await db.collection('orders').where(condition)
        .orderBy('createdAt', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get()

    const orders = ordersRes.data || []
    if (!orders.length) return { code: 0, data: [] }

    const itemEntries = await Promise.all(orders.map(async (order) => {
        const itemsRes = await db.collection('order_items').where({ orderId: order._id }).get().catch(() => ({ data: [] }))
        return [order._id, itemsRes.data || []]
    }))
    const itemMap = Object.fromEntries(itemEntries)

    return {
        code: 0,
        data: orders.map(order => ({
            ...order,
            items: itemMap[order._id] || []
        }))
    }
}

async function getMyOrderCounts(openid) {
    const baseCondition = { _openid: openid }
    const [allCount, pendingCount, refundCount] = await Promise.all([
        db.collection('orders').where(baseCondition).count().then(res => res.total || 0).catch(() => 0),
        db.collection('orders').where({ ...baseCondition, status: 'pending' }).count().then(res => res.total || 0).catch(() => 0),
        db.collection('orders').where({ ...baseCondition, status: buildOrderStatusCondition('refund') }).count().then(res => res.total || 0).catch(() => 0)
    ])

    return {
        code: 0,
        data: {
            all: allCount,
            pending: pendingCount,
            refund: refundCount
        }
    }
}

async function requestRefund(event, openid) {
    return proxyPayApi({ ...event, action: 'refund' })
}

async function proxyPayApi(data) {
    try {
        const res = await cloud.callFunction({
            name: 'payApi',
            data
        })
        return res.result || { code: -1, msg: '交易服务异常' }
    } catch (error) {
        console.error('proxyPayApi failed:', error)
        return { code: -1, msg: error.message || '交易服务异常' }
    }
}

function buildOrderStatusCondition(status) {
    if (!status || status === 'all') return null
    if (status === 'refund') {
        return _.in(['refund_requested', 'refunding', 'refunded'])
    }
    return status
}
