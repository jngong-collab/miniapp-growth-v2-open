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
        case 'createOrder':
            return proxyPayApi({ ...event, action: 'createOrder' })
        case 'requestPay':
            return proxyPayApi({ ...event, action: 'requestPay' })
        case 'getMyOrders':
            return getMyOrders(event, OPENID)
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

    return {
        code: 0,
        data: {
            product,
            campaign: campaignsRes.data[0] || null,
            packageDetail: packageRes.data[0] || null
        }
    }
}

async function getMyOrders(event, openid) {
    const { status = 'all', page = 1, pageSize = 30 } = event
    const condition = { _openid: openid }
    if (status && status !== 'all') condition.status = status

    const orders = await db.collection('orders').where(condition)
        .orderBy('createdAt', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get()

    return { code: 0, data: orders.data || [] }
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
