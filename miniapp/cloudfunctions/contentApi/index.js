const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const MALL_CATEGORIES = ['五行泡浴', '百草元气灸', '靶向敷贴', '精油系列', '超值套餐']

exports.main = async (event) => {
    const { OPENID } = cloud.getWXContext()
    const { action } = event

    switch (action) {
        case 'getHomeContent':
            return getHomeContent(OPENID, event)
        case 'getMallContent':
            return getMallContent(event)
        default:
            return { code: -1, msg: '未知操作' }
    }
}

async function getHomeContent(openid, event = {}) {
    const now = new Date()
    const runtime = await loadReviewRuntime(openid, event)
    const storeCondition = runtime.storeId ? { _id: runtime.storeId } : {}
    const productCondition = { status: 'on', showInMall: true }
    if (runtime.storeId) productCondition.storeId = runtime.storeId

    const [storeInfo, featuredProducts, fissionCampaigns, lotteryCampaigns] = await Promise.all([
        safeGetFirst('stores', storeCondition),
        safeList('products', productCondition, { orderBy: ['sortOrder', 'asc'], limit: 6 }),
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

    const safeStoreInfo = storeInfo ? await sanitizeStore(storeInfo, runtime.reviewConfig) : null

    return {
        code: 0,
        data: {
            storeInfo: safeStoreInfo,
            featuredProducts,
            fissionCampaigns,
            lotteryCampaigns,
            shareImageUrl: runtime.reviewConfig.safeShareImageUrl || ''
        }
    }
}

async function getMallContent(event) {
    const { category = '', type = '', keyword = '', page = 1, pageSize = 10 } = event
    const productCondition = { status: 'on', showInMall: true }
    const resolvedCategory = resolveMallCategory(category, type)
    if (resolvedCategory) productCondition.category = resolvedCategory
    if (keyword && keyword.trim()) {
        const safeKeyword = keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        productCondition.name = db.RegExp({
            regexp: safeKeyword,
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

function resolveMallCategory(category, legacyType) {
    const normalizedCategory = (category || '').trim()
    if (MALL_CATEGORIES.includes(normalizedCategory)) return normalizedCategory

    const normalizedLegacyType = (legacyType || '').trim()
    if (MALL_CATEGORIES.includes(normalizedLegacyType)) return normalizedLegacyType

    return ''
}

async function loadReviewRuntime(openid, event = {}) {
    const user = openid ? await safeGetFirst('users', { _openid: openid }) : null
    const storeId = await resolveUserStoreId({
        openid,
        invitedBy: event.invitedBy || '',
        currentUser: user
    })
    const aiConfig = storeId
        ? await safeGetFirst('ai_config', { storeId })
        : await safeGetFirst('ai_config', { enabled: true })
    return {
        storeId,
        reviewConfig: sanitizeReviewConfig(aiConfig && aiConfig.reviewConfig)
    }
}

async function resolveUserStoreId({ openid, invitedBy = '', currentUser = null } = {}) {
    if (!openid) {
        const stores = await safeList('stores', {}, { limit: 2 })
        return stores.length === 1 ? (stores[0]._id || '') : ''
    }

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

function sanitizeReviewConfig(reviewConfig = {}) {
    return {
        enabled: reviewConfig.enabled === true,
        safeBannerUrl: String(reviewConfig.safeBannerUrl || '').trim(),
        safeShareImageUrl: String(reviewConfig.safeShareImageUrl || '').trim()
    }
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
        console.error('contentApi 转换云存储资源失败:', error)
        return {}
    }
}

async function sanitizeStore(store, reviewConfig = {}) {
    const { adminOpenids, staff, ...rest } = store || {}
    if (reviewConfig.enabled && reviewConfig.safeBannerUrl) {
        rest.banners = [reviewConfig.safeBannerUrl]
    }
    if (reviewConfig.enabled && reviewConfig.safeShareImageUrl) {
        rest.shareImageUrl = reviewConfig.safeShareImageUrl
    }
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
