/**
 * 门店初始化脚本
 * 功能：在云开发数据库中创建初始示例数据
 * 使用方式：
 *   1. 在微信开发者工具 → 云函数 → 新建临时云函数
 *   2. 粘贴此代码运行一次
 *   3. 完成后删除临时云函数
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID

    // ============ 1. 门店信息 ============
    const stores = await db.collection('stores').limit(1).get()
    if (stores.data.length === 0) {
        await db.collection('stores').add({
            data: {
                name: '浴小主小儿推拿',
                phone: '138-0000-0000',
                address: '广州市天河区示例街道 1 号',
                latitude: 23.1291,
                longitude: 113.2644,
                description: '专业小儿推拿，呵护宝宝健康成长',
                logo: '',
                banners: [],
                adminOpenids: [openid],  // ← 当前user自动成为管理员
                createdAt: db.serverDate()
            }
        })
        console.log('✅ 门店信息创建成功，管理员 OpenID:', openid)
    }

    // ============ 2. AI 配置（占位） ============
    const ai = await db.collection('ai_config').limit(1).get()
    if (ai.data.length === 0) {
        await db.collection('ai_config').add({
            data: {
                storeId: 'default', enabled: false,
                apiUrl: 'https://api.openai.com/v1/chat/completions',
                apiKey: '',
                model: 'gpt-4o',
                systemPrompt: '你是一位中医舌诊专家，请分析用户上传的舌象照片。请从舌色、舌苔、舌形、润燥四个维度分析。以JSON格式返回结果，包含字段：tongueColor、tongueCoating、tongueShape、moisture、conclusion、suggestions（数组）。',
                dailyLimit: 100,
                userDailyLimit: 3,
                createdAt: db.serverDate()
            }
        })
        console.log('✅ AI 配置创建（待填入 API Key）')
    }

    // ============ 3. 示例商品 ============
    const products = await db.collection('products').limit(1).get()
    if (products.data.length === 0) {
        const sampleProducts = [
            {
                name: '小儿捏脊体验课',
                type: 'service',
                price: 9900,
                originalPrice: 19900,
                description: '专业推拿师一对一操作，舒缓宝宝脾胃，增强体质',
                images: [],
                detail: '<p>适用年龄：0-12岁</p><p>时长：约30分钟</p><p>注意：请提前预约时间</p>',
                efficacy: '健脾胃、增强体质',
                stock: -1, soldCount: 0, sortOrder: 1,
                status: 'on', deliveryType: 'instore', tags: ['体验', '推荐'],
                createdAt: db.serverDate(), updatedAt: db.serverDate()
            },
            {
                name: '脾胃调理套餐（10次）',
                type: 'package',
                price: 79900,
                originalPrice: 99900,
                description: '10次脾胃调理推拿，适合消化不良、食欲不振的宝宝',
                images: [],
                detail: '<p>包含10次推拿服务</p><p>有效期：购买后180天内使用</p>',
                efficacy: '改善消化、健脾和胃',
                stock: -1, soldCount: 0, sortOrder: 2,
                status: 'on', deliveryType: 'instore', tags: ['套餐', '热销'],
                createdAt: db.serverDate(), updatedAt: db.serverDate()
            }
        ]
        for (const p of sampleProducts) {
            const res = await db.collection('products').add({ data: p })
            // 为套餐添加明细
            if (p.type === 'package') {
                await db.collection('packages').add({
                    data: {
                        productId: res._id,
                        items: [{ name: '脾胃推拿', count: 10 }],
                        validDays: 180,
                        createdAt: db.serverDate()
                    }
                })
            }
        }
        console.log('✅ 示例商品创建成功')
    }

    return { code: 0, msg: '初始化完成', adminOpenid: openid }
}
