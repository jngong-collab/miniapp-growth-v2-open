const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const MALL_CATEGORIES = ['五行泡浴', '百草元气灸', '靶向敷贴', '精油系列', '超值套餐']

exports.main = async (event) => {
    const { action } = event

    switch (action) {
        case 'getHomeContent':
            return getHomeContent()
        case 'getMallContent':
            return getMallContent(event)
        default:
            return { code: -1, msg: '未知操作' }
    }
}

async function getHomeContent() {
    const now = new Date()

    const [storeInfo, featuredProducts, fissionCampaigns, lotteryCampaigns] = await Promise.all([
        safeGetFirst('stores', {}),
        safeList('products', { status: 'on', showInMall: true }, { orderBy: ['sortOrder', 'asc'], limit: 6 }),
        safeList('fission_campaigns', {
            status: 'active',
            startTime: _.lte(now),
            endTime: _.gte(now)
        }, { orderBy: ['createdAt', 'desc'], limit: 4 }),
        safeList('lottery_campaigns', {
            status: 'active',
            startTime: _.lte(now),
            endTime: _.gte(now)
        }, { orderBy: ['createdAt', 'desc'], limit: 4 })
    ])

    return {
        code: 0,
        data: {
            storeInfo: storeInfo ? sanitizeStore(storeInfo) : null,
            featuredProducts,
            fissionCampaigns,
            lotteryCampaigns
        }
    }
}

async function getMallContent(event) {
    const { category = '', type = '', keyword = '', page = 1, pageSize = 10 } = event
    const productCondition = { status: 'on', showInMall: true }
    const resolvedCategory = resolveMallCategory(category, type)
    if (resolvedCategory) productCondition.category = resolvedCategory
    if (keyword && keyword.trim()) {
        productCondition.name = db.RegExp({
            regexp: keyword.trim(),
            options: 'i'
        })
    }

    const now = new Date()
    const [products, fissionCampaigns] = await Promise.all([
        safeList('products', productCondition, {
            orderBy: ['sortOrder', 'asc'],
            limit: pageSize,
            skip: (page - 1) * pageSize
        }),
        safeList('fission_campaigns', {
            status: 'active',
            startTime: _.lte(now),
            endTime: _.gte(now)
        }, {
            orderBy: ['createdAt', 'desc'],
            limit: 10
        })
    ])

    const campaignMap = {}
    fissionCampaigns.forEach(item => {
        campaignMap[item.productId] = item
    })

    return {
        code: 0,
        data: {
            products: products.map(item => ({
                ...item,
                hasCashback: !!campaignMap[item._id]
            })),
            fissionCampaigns
        }
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

async function safeList(collectionName, condition = {}, options = {}) {
    try {
        let query = db.collection(collectionName).where(condition)
        if (options.orderBy) query = query.orderBy(options.orderBy[0], options.orderBy[1])
        if (options.skip) query = query.skip(options.skip)
        query = query.limit(options.limit || 20)
        const res = await query.get()
        return res.data || []
    } catch (error) {
        return []
    }
}

function sanitizeStore(store) {
    const { adminOpenids, staff, ...rest } = store
    return rest
}

function resolveMallCategory(category, legacyType) {
    const normalizedCategory = (category || '').trim()
    if (MALL_CATEGORIES.includes(normalizedCategory)) return normalizedCategory

    const normalizedLegacyType = (legacyType || '').trim()
    if (MALL_CATEGORIES.includes(normalizedLegacyType)) return normalizedLegacyType

    return ''
}
