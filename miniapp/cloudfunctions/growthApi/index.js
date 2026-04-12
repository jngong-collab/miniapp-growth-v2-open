const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const http = require('http')
const https = require('https')

exports.main = async (event) => {
    const { OPENID } = cloud.getWXContext()
    const { action } = event

    switch (action) {
        case 'getMyEarnings':
            return getMyEarnings(OPENID)
        case 'getMyFissionRecords':
            return getMyFissionRecords(OPENID)
        case 'getMyPackages':
            return getMyPackages(OPENID)
        case 'getLotteryHome':
            return getLotteryHome(OPENID)
        case 'drawLottery':
            return drawLottery(OPENID)
        case 'analyzeTongue':
            return analyzeTongue(event, OPENID)
        case 'getTongueReport':
            return getTongueReport(event, OPENID)
        case 'getTongueHistory':
            return getTongueHistory(OPENID)
        default:
            return { code: -1, msg: '未知操作' }
    }
}

async function getMyEarnings(openid) {
    const res = await safeGetFirst('users', { _openid: openid }, {
        balance: true,
        totalEarned: true,
        totalInvited: true,
        memberLevel: true,
        leadSources: true
    })
    if (!res) return { code: -1, msg: '用户不存在' }
    return { code: 0, data: res }
}

async function getMyFissionRecords(openid) {
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

async function getMyPackages(openid) {
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

async function getLotteryHome(openid) {
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

async function drawLottery(openid) {
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

async function analyzeTongue(event, openid) {
    const { imageFileId, babyAge, babyGender, symptoms } = event

    const configRes = await db.collection('ai_config').where({ enabled: true }).limit(1).get()
    if (configRes.data.length === 0) {
        return { code: -1, msg: 'AI 功能未配置，请联系门店' }
    }
    const aiConfig = configRes.data[0]

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [userUsageRes, globalUsageRes] = await Promise.all([
        db.collection('tongue_reports').where({
            _openid: openid,
            createdAt: _.gte(today)
        }).count(),
        db.collection('tongue_reports').where({
            createdAt: _.gte(today)
        }).count()
    ])

    if (aiConfig.userDailyLimit > 0 && userUsageRes.total >= aiConfig.userDailyLimit) {
        return { code: -2, msg: `今日分析次数已用完（每日限 ${aiConfig.userDailyLimit} 次）` }
    }
    if (aiConfig.dailyLimit > 0 && globalUsageRes.total >= aiConfig.dailyLimit) {
        return { code: -3, msg: '今日门店分析次数已达上限，请明日再来' }
    }

    let imageUrl = imageFileId
    if (imageFileId && imageFileId.startsWith('cloud://')) {
        try {
            const fileRes = await cloud.getTempFileURL({ fileList: [imageFileId] })
            imageUrl = fileRes.fileList[0].tempFileURL
        } catch (e) {
            console.error('获取图片链接失败:', e.message)
            return { code: -1, msg: '图片处理失败，请重试' }
        }
    }

    let productCatalog = ''
    try {
        const productsRes = await db.collection('products').where({ status: 'on' }).limit(100).get()
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

    try {
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
        if (!content) return { code: -1, msg: 'AI 返回结果为空，请重试' }

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

        if (result.features) {
            result.tongueColor = result.features.color || result.tongueColor || ''
            result.tongueCoating = result.features.coating || result.tongueCoating || ''
            result.tongueShape = result.features.shape || result.tongueShape || ''
            result.moisture = result.features.moisture || result.moisture || ''
        }

        const reportRes = await db.collection('tongue_reports').add({
            data: {
                _openid: openid,
                imageFileId,
                babyAge: babyAge || '',
                babyGender: babyGender || '',
                symptoms: symptoms || [],
                result: {
                    conclusion: result.conclusion || '',
                    tongueColor: result.tongueColor || '',
                    tongueCoating: result.tongueCoating || '',
                    tongueShape: result.tongueShape || '',
                    moisture: result.moisture || '',
                    features: result.features || {},
                    analysis_details: result.analysis_details || '',
                    product_recommendations: result.product_recommendations || [],
                    suggestions: result.suggestions || []
                },
                shareCount: 0,
                createdAt: db.serverDate()
            }
        })

        return { code: 0, data: { reportId: reportRes._id, ...result } }
    } catch (err) {
        console.error('AI 分析失败:', err)
        const msg = err.message || ''
        if (msg.includes('timed out') || msg.includes('time_limit') || msg.includes('较多')) {
            return { code: -1, msg: '当前访问人数较多，请稍后再试' }
        }
        return { code: -1, msg: `AI 分析失败，请重试` }
    }
}

async function getTongueReport(event, openid) {
    try {
        const res = await db.collection('tongue_reports').doc(event.reportId).get()
        const report = res.data
        if (!report) return { code: -1, msg: '报告不存在' }
        if (report._openid !== openid) return { code: 403, msg: '无权查看此报告' }

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

async function getTongueHistory(openid) {
    const res = await db.collection('tongue_reports').where({ _openid: openid })
        .orderBy('createdAt', 'desc')
        .limit(20)
        .field({ imageFileId: true, 'result.conclusion': true, createdAt: true })
        .get()
    return { code: 0, data: res.data }
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
