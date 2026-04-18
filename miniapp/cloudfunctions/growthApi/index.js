const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const http = require('http')
const https = require('https')
const AUTH_SESSION_COLLECTION = 'auth_sessions'
const MEMBER_LEVELS = ['normal', 'vip', 'svip']
const AUTH_REQUIRED_CODE = 401
const AUTH_REQUIRED_MSG = '未登录，请先完成手机号登录'

exports.main = async (event) => {
    const { OPENID } = cloud.getWXContext()
    const { action } = event

    switch (action) {
        case 'ensureUser':
        case 'login':
        case 'initUser':
            return { code: 0, data: { openid: OPENID, userInfo: {} } }
        case 'getMyEarnings':
            return getMyEarnings(OPENID, event)
        case 'getMyFissionRecords':
            return getMyFissionRecords(OPENID, event)
        case 'getMyPackages':
            return getMyPackages(OPENID, event)
        case 'getLotteryHome':
            return getLotteryHome(OPENID, event)
        case 'drawLottery':
            return drawLottery(OPENID, event)
        case 'getTongueRuntimeConfig':
            return getTongueRuntimeConfig(OPENID, event)
        case 'analyzeTongue':
            return analyzeTongue(OPENID, event)
        case 'getTongueReport':
            return getTongueReport(OPENID, event)
        case 'getTongueHistory':
            return getTongueHistory(OPENID, event)
        case 'reanalyzeTongueReport':
            return reanalyzeTongueReport(OPENID, event)
        default:
            return { code: -1, msg: '未知操作' }
    }
}

async function getMyEarnings(openid, event = {}) {
    const auth = await ensureAuth(openid, event)
    if (auth.code) return auth
    return { code: 0, data: auth.user }
}

async function getMyFissionRecords(openid, event = {}) {
    const auth = await ensureAuth(openid, event)
    if (auth.code) return auth

    const records = await safeList('fission_records', { inviterOpenid: openid }, {
        orderBy: ['createdAt', 'desc'],
        limit: 50
    })

    const inviteeIds = Array.from(new Set(records.map(item => item.inviteeOpenid)))
    const userMap = {}
    if (inviteeIds.length > 0) {
        const users = await safeList('users', { _openid: _.in(inviteeIds) }, { limit: inviteeIds.length })
        users.forEach(item => {
            userMap[item._openid] = item
        })
    }

    return {
        code: 0,
        data: records.map(item => ({
            ...item,
            inviteeName: userMap[item.inviteeOpenid]?.nickName || '用户',
            inviteeAvatar: userMap[item.inviteeOpenid]?.avatarUrl || ''
        }))
    }
}

async function getMyPackages(openid, event = {}) {
    const auth = await ensureAuth(openid, event)
    if (auth.code) return auth

    const items = await safeList('order_items', {
        _openid: openid,
        productType: _.in(['service', 'package'])
    }, { orderBy: ['createdAt', 'desc'] })
    if (!items.length) return { code: 0, data: [] }

    const orderIds = Array.from(new Set(items.map(item => item.orderId)))
    const paidOrders = await safeList('orders', {
        _id: _.in(orderIds),
        status: 'paid'
    }, { limit: orderIds.length })
    const paidOrderSet = new Set(paidOrders.map(item => item._id))

    return {
        code: 0,
        data: items.filter(item => paidOrderSet.has(item.orderId))
    }
}

async function getLotteryHome(openid, event = {}) {
    const auth = await ensureAuth(openid, event)
    if (auth.code) return auth

    const campaign = await getActiveLotteryCampaign()
    if (!campaign) {
        return { code: 0, data: { campaign: null, remainChances: 0, records: [] } }
    }

    const remainChances = await getRemainChances(openid, campaign)
    const records = await safeList('lottery_records', { _openid: openid }, {
        orderBy: ['createdAt', 'desc'],
        limit: 10
    })

    return {
        code: 0,
        data: {
            campaign: sanitizeLotteryCampaign(campaign),
            remainChances,
            records
        }
    }
}

async function drawLottery(openid, event = {}) {
    const auth = await ensureAuth(openid, event)
    if (auth.code) return auth

    const campaign = await getActiveLotteryCampaign()
    if (!campaign) return { code: -1, msg: '当前暂无抽奖活动' }

    const remainChances = await getRemainChances(openid, campaign)
    if (remainChances <= 0) {
        return { code: -1, msg: '今日次数已用完，明天再来' }
    }

    const prize = pickLotteryPrize(campaign.prizes || [])
    if (!prize) return { code: -1, msg: '活动奖品配置异常' }

    await db.collection('lottery_records').add({
        data: {
            _openid: openid,
            campaignId: campaign._id,
            prizeId: prize.id,
            prizeName: prize.name,
            prizeIcon: prize.icon || '',
            status: prize.name === '谢谢参与' ? 'missed' : 'won',
            createdAt: db.serverDate()
        }
    })

    return {
        code: 0,
        data: {
            prize,
            remainChances: remainChances - 1
        }
    }
}

async function getTongueRuntimeConfig(openid, event = {}) {
    const runtime = await loadTongueRuntime(openid, event, null)
    return {
        code: 0,
        data: {
            storeId: runtime.storeId || '',
            reviewConfig: runtime.reviewConfig,
            isInReview: runtime.isInReview
        }
    }
}

async function analyzeTongue(openid, event = {}) {
    const auth = await ensureAuth(openid, event)
    if (auth.code) return auth

    const { imageFileId, babyAge, babyGender } = event
    const symptoms = normalizeSymptoms(event.symptoms)
    const runtime = await loadTongueRuntime(openid, event, auth.user)

    if (runtime.isInReview) {
        const reviewRecord = await createTongueReportRecord({
            openid,
            storeId: runtime.storeId,
            imageFileId,
            babyAge,
            babyGender,
            symptoms,
            result: null,
            isReviewMode: true,
            extra: {
                reviewSavedAt: db.serverDate()
            }
        })

        return {
            code: 0,
            data: {
                reportId: reviewRecord._id,
                reviewMode: true,
                isReviewMode: true,
                result: null
            }
        }
    }

    if (!runtime.aiConfig || !runtime.aiConfig.enabled) {
        return { code: -1, msg: 'AI 功能未配置，请联系门店' }
    }

    const limitResult = await ensureTongueLimits({
        openid,
        storeId: runtime.storeId,
        aiConfig: runtime.aiConfig
    })
    if (limitResult) return limitResult

    try {
        const result = await runTongueAiAnalysis({
            aiConfig: runtime.aiConfig,
            imageFileId,
            babyAge,
            babyGender,
            symptoms,
            storeId: runtime.storeId
        })

        const reportRes = await createTongueReportRecord({
            openid,
            storeId: runtime.storeId,
            imageFileId,
            babyAge,
            babyGender,
            symptoms,
            result,
            isReviewMode: false
        })

        return { code: 0, data: { reportId: reportRes._id, ...result } }
    } catch (err) {
        console.error('AI 分析失败:', err)
        const msg = err.message || ''
        if (msg.includes('timed out') || msg.includes('time_limit') || msg.includes('较多')) {
            return { code: -1, msg: '当前访问人数较多，请稍后再试' }
        }
        return { code: -1, msg: 'AI 分析失败，请重试' }
    }
}

async function getTongueReport(openid, event = {}) {
    const auth = await ensureAuth(openid, event)
    if (auth.code) return auth

    try {
        const runtime = await loadTongueRuntime(openid, event, auth.user)
        const res = await db.collection('tongue_reports').doc(event.reportId).get()
        const report = res.data
        if (!report) return { code: -1, msg: '报告不存在' }
        if (report._openid !== openid) return { code: 403, msg: '无权查看此报告' }

        if (runtime.isInReview) {
            return { code: 0, data: buildReviewSafeReport(report, runtime.reviewConfig) }
        }

        if (report.result?.product_recommendations?.length > 0) {
            try {
                const productsRes = await db.collection('products').where({ status: 'on' }).limit(200).get()
                const allProducts = productsRes.data
                const cloudImages = []

                report.result.product_recommendations = report.result.product_recommendations.map(rec => {
                    let real = allProducts.find(p => p.name === rec.product_name)
                    if (!real) {
                        real = allProducts.find(p =>
                            p.name && rec.product_name &&
                            (p.name.includes(rec.product_name) || rec.product_name.includes(p.name))
                        )
                    }
                    if (real) {
                        rec.productId = real._id
                        rec.priceYuan = (real.price / 100).toFixed(2).replace(/\\.00$/, '')
                        if (real.originalPrice) {
                            rec.originalPriceYuan = (real.originalPrice / 100).toFixed(2).replace(/\\.00$/, '')
                        }
                        rec.selling_point = rec.selling_point || real.sellingPoint || ''
                        rec.category = rec.category || real.category || '推荐产品'
                        rec.image = real.images?.[0] || ''
                        if (rec.image && rec.image.startsWith('cloud://')) {
                            cloudImages.push(rec.image)
                        }
                    }
                    return rec
                })

                if (cloudImages.length > 0) {
                    try {
                        const urlRes = await cloud.getTempFileURL({ fileList: [...new Set(cloudImages)] })
                        const urlMap = {}
                        urlRes.fileList.forEach(item => { if (item.tempFileURL) urlMap[item.fileID] = item.tempFileURL })
                        report.result.product_recommendations.forEach(item => {
                            if (item.image && urlMap[item.image]) item.image = urlMap[item.image]
                        })
                    } catch (e) {
                        console.log('获取图片临时URL失败:', e.message)
                    }
                }
            } catch (e) {
                console.error('获取推荐产品失败:', e)
            }
        }

        return { code: 0, data: report }
    } catch (err) {
        return { code: -1, msg: '报告不存在' }
    }
}

async function getTongueHistory(openid, event = {}) {
    const auth = await ensureAuth(openid, event)
    if (auth.code) return auth

    const runtime = await loadTongueRuntime(openid, event, auth.user)
    const condition = { _openid: openid }
    if (runtime.isInReview) {
        condition.isReviewMode = true
    }

    const res = await db.collection('tongue_reports').where(condition)
        .orderBy('createdAt', 'desc')
        .limit(20)
        .field({ imageFileId: true, 'result.conclusion': true, createdAt: true, isReviewMode: true, result: true })
        .get()

    const data = runtime.isInReview
        ? res.data.map(item => buildReviewSafeHistoryItem(item))
        : res.data.map(item => ({
            ...item,
            isReviewMode: item.isReviewMode === true,
            canReanalyze: item.isReviewMode === true && !hasTongueResult(item.result)
        }))

    return { code: 0, data }
}

async function reanalyzeTongueReport(openid, event = {}) {
    const auth = await ensureAuth(openid, event)
    if (auth.code) return auth

    const reportId = String(event.reportId || '').trim()
    if (!reportId) return { code: -1, msg: '报告不存在' }

    const runtime = await loadTongueRuntime(openid, event, auth.user)
    if (runtime.isInReview) {
        return { code: -1, msg: '审核模式下不可发起 AI 分析' }
    }
    if (!runtime.aiConfig || !runtime.aiConfig.enabled) {
        return { code: -1, msg: 'AI 功能未配置，请联系门店' }
    }

    let report
    try {
        const res = await db.collection('tongue_reports').doc(reportId).get()
        report = res.data
    } catch (error) {
        return { code: -1, msg: '报告不存在' }
    }

    if (!report || report._openid !== openid) return { code: 403, msg: '无权操作此报告' }
    if (report.isReviewMode !== true) return { code: -1, msg: '该记录不是审核模式记录' }
    if (hasTongueResult(report.result)) return { code: -1, msg: '该记录已完成分析' }
    if (!report.imageFileId) return { code: -1, msg: '图片缺失，无法重新分析' }

    const limitResult = await ensureTongueLimits({
        openid,
        storeId: runtime.storeId || report.storeId || '',
        aiConfig: runtime.aiConfig
    })
    if (limitResult) return limitResult

    try {
        const result = await runTongueAiAnalysis({
            aiConfig: runtime.aiConfig,
            imageFileId: report.imageFileId,
            babyAge: report.babyAge || '',
            babyGender: report.babyGender || '',
            symptoms: normalizeSymptoms(report.symptoms),
            storeId: runtime.storeId || report.storeId || ''
        })

        const normalizedResult = normalizeTongueResult(result)
        await db.collection('tongue_reports').doc(reportId).update({
            data: {
                result: normalizedResult,
                reanalyzedAt: db.serverDate(),
                reanalyzeSource: 'review_record',
                updatedAt: db.serverDate()
            }
        })

        return {
            code: 0,
            data: {
                reportId,
                reanalyzedAt: new Date().toISOString(),
                ...normalizedResult
            }
        }
    } catch (err) {
        console.error('重新分析失败:', err)
        const msg = err.message || ''
        if (msg.includes('timed out') || msg.includes('time_limit') || msg.includes('较多')) {
            return { code: -1, msg: '当前访问人数较多，请稍后再试' }
        }
        return { code: -1, msg: 'AI 分析失败，请重试' }
    }
}

async function loadTongueRuntime(openid, event = {}, currentUser = null) {
    const user = currentUser || await safeGetFirst('users', { _openid: openid })
    const storeId = await resolveUserStoreId({
        openid,
        invitedBy: event.invitedBy || '',
        currentUser: user
    })
    const aiConfig = storeId
        ? await safeGetFirst('ai_config', { storeId })
        : await safeGetFirst('ai_config', { enabled: true })
    const reviewConfig = sanitizeReviewConfig(aiConfig && aiConfig.reviewConfig)

    return {
        user,
        storeId,
        aiConfig,
        reviewConfig,
        isInReview: reviewConfig.enabled === true
    }
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

function sanitizeReviewConfig(reviewConfig = {}) {
    const safeReviewConfig = reviewConfig && typeof reviewConfig === 'object' ? reviewConfig : {}
    return {
        enabled: safeReviewConfig.enabled === true,
        entryTitle: String(safeReviewConfig.entryTitle || '').trim(),
        pageTitle: String(safeReviewConfig.pageTitle || '').trim(),
        historyTitle: String(safeReviewConfig.historyTitle || '').trim(),
        reportTitle: String(safeReviewConfig.reportTitle || '').trim(),
        submitText: String(safeReviewConfig.submitText || '').trim(),
        shareTitle: String(safeReviewConfig.shareTitle || '').trim(),
        emptyText: String(safeReviewConfig.emptyText || '').trim(),
        listTagText: String(safeReviewConfig.listTagText || '').trim(),
        safeBannerUrl: String(safeReviewConfig.safeBannerUrl || '').trim(),
        safeShareImageUrl: String(safeReviewConfig.safeShareImageUrl || '').trim(),
        hideHistoryAiRecords: safeReviewConfig.hideHistoryAiRecords !== false,
        allowReanalyzeAfterReview: safeReviewConfig.allowReanalyzeAfterReview !== false
    }
}

function normalizeSymptoms(symptoms) {
    return Array.isArray(symptoms)
        ? symptoms.map(item => String(item || '').trim()).filter(Boolean)
        : []
}

async function ensureTongueLimits({ openid, storeId, aiConfig }) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const userCondition = {
        _openid: openid,
        createdAt: _.gte(today),
        isReviewMode: _.neq(true)
    }
    const storeCondition = {
        createdAt: _.gte(today),
        isReviewMode: _.neq(true)
    }
    if (storeId) {
        storeCondition.storeId = storeId
    }

    const [userUsageRes, globalUsageRes] = await Promise.all([
        db.collection('tongue_reports').where(userCondition).count(),
        db.collection('tongue_reports').where(storeCondition).count()
    ])

    if (aiConfig.userDailyLimit > 0 && userUsageRes.total >= aiConfig.userDailyLimit) {
        return { code: -2, msg: `今日分析次数已用完（每日限 ${aiConfig.userDailyLimit} 次）` }
    }
    if (aiConfig.dailyLimit > 0 && globalUsageRes.total >= aiConfig.dailyLimit) {
        return { code: -3, msg: '今日门店分析次数已达上限，请明日再来' }
    }

    return null
}

async function runTongueAiAnalysis({ aiConfig, imageFileId, babyAge, babyGender, symptoms, storeId }) {
    let imageUrl = imageFileId
    if (imageFileId && imageFileId.startsWith('cloud://')) {
        try {
            const fileRes = await cloud.getTempFileURL({ fileList: [imageFileId] })
            imageUrl = fileRes.fileList[0].tempFileURL
        } catch (e) {
            console.error('获取图片链接失败:', e.message)
            throw new Error('图片处理失败，请重试')
        }
    }

    let productCatalog = ''
    try {
        const productCondition = { status: 'on' }
        if (storeId) productCondition.storeId = storeId
        const productsRes = await db.collection('products').where(productCondition).limit(100).get()
        if (productsRes.data.length > 0) {
            const lines = productsRes.data.map(p => {
                const price = p.price ? `¥${(p.price / 100).toFixed(0)}` : ''
                return `- ${p.name} | 卖点: ${p.sellingPoint || p.description || ''} | 适用体质: ${p.applicableConstitution || ''} | 核心功效: ${p.efficacy || ''} | 建议零售价: ${price}`
            })
            productCatalog = `\n\n---\n以下是当前商城在售的产品库，请从中精选 2-3 款推荐：\n${lines.join('\n')}`
        }
    } catch (e) {
        console.log('读取产品库失败:', e.message)
    }

    let babyContext = ''
    if (babyAge) babyContext += `宝宝年龄：${babyAge}。`
    if (babyGender) babyContext += `性别：${babyGender === 'boy' ? '男' : '女'}宝。`
    if (symptoms && symptoms.length > 0) babyContext += `主诉症状：${symptoms.join('；')}。`
    if (babyContext) babyContext = `\n\n【宝宝信息】${babyContext}`

    const finalPrompt = (aiConfig.systemPrompt || '你是一位中医舌诊专家，请分析用户上传的舌象照片。') + babyContext + productCatalog
    const parsedUrl = new URL(aiConfig.apiUrl)
    const httpModule = parsedUrl.protocol === 'https:' ? https : http
    const apiPath = (!parsedUrl.pathname || parsedUrl.pathname === '/') ? '/v1/chat/completions' : parsedUrl.pathname

    const requestBody = JSON.stringify({
        model: aiConfig.model,
        messages: [
            { role: 'system', content: finalPrompt },
            {
                role: 'user',
                content: [
                    { type: 'text', text: '请分析这张舌象照片，以JSON格式返回分析结果' },
                    { type: 'image_url', image_url: { url: imageUrl } }
                ]
            }
        ],
        max_tokens: 2000,
        response_format: { type: 'json_object' }
    })

    const aiResult = await new Promise((resolve, reject) => {
        const req = httpModule.request({
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: apiPath,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${aiConfig.apiKey}`
            },
            timeout: 60000
        }, res => {
            let data = ''
            res.on('data', chunk => { data += chunk })
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data))
                } catch (error) {
                    reject(new Error(`AI 响应解析失败: ${data.slice(0, 200)}`))
                }
            })
        })
        req.on('error', reject)
        req.on('timeout', () => {
            req.destroy()
            reject(new Error('当前访问人数较多，请稍后再试'))
        })
        req.write(requestBody)
        req.end()
    })

    const content = aiResult.choices?.[0]?.message?.content
    if (!content) throw new Error('AI 返回结果为空，请重试')

    let result
    try {
        result = JSON.parse(content)
    } catch (e) {
        result = {
            conclusion: content.slice(0, 100),
            features: {},
            analysis_details: content,
            product_recommendations: [],
            suggestions: []
        }
    }

    return normalizeTongueResult(result)
}

function normalizeTongueResult(result = {}) {
    const features = result.features || {}
    return {
        conclusion: result.conclusion || '',
        tongueColor: features.color || result.tongueColor || '',
        tongueCoating: features.coating || result.tongueCoating || '',
        tongueShape: features.shape || result.tongueShape || '',
        moisture: features.moisture || result.moisture || '',
        features,
        analysis_details: result.analysis_details || '',
        product_recommendations: Array.isArray(result.product_recommendations) ? result.product_recommendations : [],
        suggestions: Array.isArray(result.suggestions) ? result.suggestions : []
    }
}

async function createTongueReportRecord({ openid, storeId, imageFileId, babyAge, babyGender, symptoms, result, isReviewMode, extra = {} }) {
    const payload = {
        _openid: openid,
        storeId: storeId || '',
        imageFileId: imageFileId || '',
        babyAge: babyAge || '',
        babyGender: babyGender || '',
        symptoms: normalizeSymptoms(symptoms),
        result: result ? normalizeTongueResult(result) : null,
        isReviewMode: isReviewMode === true,
        shareCount: 0,
        createdAt: db.serverDate(),
        ...extra
    }

    return db.collection('tongue_reports').add({ data: payload })
}

function hasTongueResult(result) {
    if (!result || typeof result !== 'object') return false
    if (String(result.conclusion || '').trim()) return true
    if (String(result.analysis_details || '').trim()) return true
    if (Array.isArray(result.product_recommendations) && result.product_recommendations.length > 0) return true
    if (Array.isArray(result.suggestions) && result.suggestions.length > 0) return true
    return false
}

async function ensureAuth(openid, event = {}) {
    const token = String((event || {}).sessionToken || '').trim()
    if (!token) return { code: AUTH_REQUIRED_CODE, msg: AUTH_REQUIRED_MSG }

    const session = await safeGetFirst(AUTH_SESSION_COLLECTION, {
        token,
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

    if (!user.phone) return { code: AUTH_REQUIRED_CODE, msg: '请先绑定手机号' }

    const normalizedMemberLevel = normalizeMemberLevel(user.memberLevel)
    if (normalizedMemberLevel !== user.memberLevel) {
        await db.collection('users').where({ _openid: openid }).update({
            data: { memberLevel: normalizedMemberLevel, updatedAt: db.serverDate() }
        })
        user.memberLevel = normalizedMemberLevel
    }

    await refreshSession(session)
    return {
        code: 0,
        user,
        session,
        data: { user, session: { token: session.token, expiresAt: session.expiresAt } }
    }
}

function buildReviewSafeHistoryItem(item = {}) {
    return {
        _id: item._id,
        imageFileId: item.imageFileId || '',
        createdAt: item.createdAt || null,
        isReviewMode: true,
        result: null
    }
}

function buildReviewSafeReport(report = {}, reviewConfig = {}) {
    return {
        _id: report._id,
        _openid: report._openid,
        storeId: report.storeId || '',
        imageFileId: report.imageFileId || '',
        babyAge: report.babyAge || '',
        babyGender: report.babyGender || '',
        symptoms: [],
        createdAt: report.createdAt || null,
        isReviewMode: true,
        reviewMode: true,
        canReanalyze: false,
        reviewTitle: reviewConfig.reportTitle || '',
        result: null
    }
}

async function getActiveLotteryCampaign() {
    const now = new Date()
    return safeGetFirst('lottery_campaigns', {
        status: 'active',
        startTime: _.lte(now),
        endTime: _.gte(now)
    })
}

async function getRemainChances(openid, campaign) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const used = await safeCount('lottery_records', {
        _openid: openid,
        campaignId: campaign._id,
        createdAt: _.gte(today)
    })
    const limit = campaign.dailyLimitPerUser || 3
    return Math.max(0, limit - used)
}

function pickLotteryPrize(prizes) {
    const validPrizes = prizes.filter(item => item && item.weight > 0)
    if (!validPrizes.length) return null
    const total = validPrizes.reduce((sum, item) => sum + (item.weight || 0), 0)
    let random = Math.random() * total
    for (const prize of validPrizes) {
        random -= prize.weight || 0
        if (random <= 0) return prize
    }
    return validPrizes[validPrizes.length - 1]
}

function normalizeMemberLevel(memberLevel) {
    return MEMBER_LEVELS.includes(memberLevel) ? memberLevel : 'normal'
}

function isSessionExpired(session) {
    if (!session || !session.expiresAt) return true
    const expiredAt = parseSessionDate(session.expiresAt)
    if (!expiredAt) return true
    return expiredAt.getTime() <= Date.now()
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

function newSessionExpiresAt(baseTime = new Date()) {
    return new Date(baseTime.getTime() + 30 * 24 * 60 * 60 * 1000)
}

async function refreshSession(session = {}) {
    if (!session || !session._id) return
    try {
        await db.collection(AUTH_SESSION_COLLECTION).doc(session._id).update({
            data: {
                lastActiveAt: db.serverDate(),
                expiresAt: newSessionExpiresAt(),
                updatedAt: db.serverDate()
            }
        })
    } catch (error) {
        console.error('刷新会话失败:', error)
    }
}

function sanitizeLotteryCampaign(campaign) {
    return {
        ...campaign,
        prizes: campaign.prizes || [],
        dailyLimitPerUser: campaign.dailyLimitPerUser || 3,
        rules: campaign.rules || [
            '每日可免费抽奖 3 次',
            '奖品以实际中奖结果为准',
            '请到店出示中奖记录领取奖品',
            '活动解释权归门店所有'
        ]
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

async function safeCount(collectionName, condition) {
    try {
        const res = await db.collection(collectionName).where(condition || {}).count()
        return res.total || 0
    } catch (error) {
        return 0
    }
}
