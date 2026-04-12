// 初始化示例数据脚本
// 在微信开发者工具的云开发控制台中运行此脚本
// 或者创建一个临时云函数来执行

// ============================================================
// 使用方法：
// 1. 在微信开发者工具中打开云开发控制台
// 2. 进入数据库面板
// 3. 依次创建以下集合（Collection）
// 4. 导入对应的示例数据
// ============================================================

/**
 * 需要创建的集合列表：
 * - stores
 * - ai_config
 * - pay_config
 * - products
 * - packages
 * - orders
 * - order_items
 * - fission_campaigns
 * - fission_records
 * - tongue_reports
 * - users
 * - package_usage
 */

// ============================================================
// stores 集合 - 门店信息（导入 1 条）
// ============================================================
const storeData = {
    name: '浴小主小儿推拿',
    logo: '',
    address: '示例地址 · 请在管理后台修改',
    latitude: 39.9042,
    longitude: 116.4074,
    phone: '13800138000',
    banners: [],
    description: '专业小儿推拿 · 呵护宝宝健康成长',
    adminOpenids: [],
    createdAt: new Date(),
    updatedAt: new Date()
}

// ============================================================
// products 集合 - 商品数据（导入多条）
// 注意：价格单位为「分」
// ============================================================
const productsData = [
    {
        name: '浴小主健脾温中药浴包',
        type: 'physical',
        price: 3990,
        originalPrice: 5990,
        description: '温中散寒、健脾和胃，适合脾胃虚寒的宝宝',
        images: [],
        detail: '采用多种名贵中药材精心配制，药浴泡洗，温和不刺激，适合0-12岁儿童使用。',
        stock: -1,
        soldCount: 0,
        sortOrder: 1,
        status: 'on',
        tags: ['热卖'],
        efficacy: '温中散寒、健脾和胃',
        deliveryType: 'express',
        createdAt: new Date(),
        updatedAt: new Date()
    },
    {
        name: '浴小主祛湿排浊药浴包',
        type: 'physical',
        price: 3990,
        originalPrice: 5990,
        description: '祛湿排浊、疏通经络，改善湿气重的问题',
        images: [],
        detail: '精选祛湿中药材，通过药浴方式帮助排出体内湿气，疏通经络。',
        stock: -1,
        soldCount: 0,
        sortOrder: 2,
        status: 'on',
        tags: ['推荐'],
        efficacy: '祛湿排浊、疏通经络',
        deliveryType: 'express',
        createdAt: new Date(),
        updatedAt: new Date()
    },
    {
        name: '元气灸舒缓灸贴',
        type: 'physical',
        price: 2990,
        originalPrice: 3990,
        description: '温经散寒、缓解疲劳',
        images: [],
        detail: '采用艾灸原理，贴敷穴位，温经散寒，方便携带使用。',
        stock: -1,
        soldCount: 0,
        sortOrder: 3,
        status: 'on',
        tags: [],
        efficacy: '温经散寒、缓解疲劳',
        deliveryType: 'express',
        createdAt: new Date(),
        updatedAt: new Date()
    },
    {
        name: '浴小主中脘穴位贴',
        type: 'physical',
        price: 2590,
        originalPrice: 3590,
        description: '温中散寒、助消化',
        images: [],
        detail: '专为儿童设计的穴位贴，贴敷中脘穴，帮助消化，缓解腹胀。',
        stock: -1,
        soldCount: 0,
        sortOrder: 4,
        status: 'on',
        tags: [],
        efficacy: '温中散寒、助消化',
        deliveryType: 'express',
        createdAt: new Date(),
        updatedAt: new Date()
    },
    {
        name: '小儿推拿单次体验',
        type: 'service',
        price: 6800,
        originalPrice: 9800,
        description: '专业推拿师一对一服务',
        images: [],
        detail: '由持证推拿师进行专业手法推拿，针对宝宝体质问题进行调理。30-40分钟/次。',
        stock: -1,
        soldCount: 0,
        sortOrder: 5,
        status: 'on',
        tags: ['体验'],
        efficacy: '专业推拿一次',
        deliveryType: 'instore',
        createdAt: new Date(),
        updatedAt: new Date()
    },
    {
        name: '春季助长套餐',
        type: 'package',
        price: 69900,
        originalPrice: 99900,
        description: '泡浴×5 + 推拿×6 + 敷贴×9',
        images: [],
        detail: '春季是儿童生长发育的黄金期，本套餐综合运用泡浴、推拿、敷贴三种调理方式，助力宝宝健康成长。',
        stock: -1,
        soldCount: 0,
        sortOrder: 6,
        status: 'on',
        tags: ['超值'],
        efficacy: '助力生长发育',
        deliveryType: 'instore',
        createdAt: new Date(),
        updatedAt: new Date()
    },
    {
        name: '祛湿体验装',
        type: 'physical',
        price: 1990,
        originalPrice: 3990,
        description: '裂变获客专用 · 超值体验',
        images: [],
        detail: '包含祛湿药浴包1袋，适合首次体验的新客户。购买后分享给好友，好友下单即返现！',
        stock: 500,
        soldCount: 0,
        sortOrder: 0,
        status: 'on',
        tags: ['裂变', '限时'],
        efficacy: '祛湿排浊体验装',
        deliveryType: 'express',
        createdAt: new Date(),
        updatedAt: new Date()
    }
]

// ============================================================
// packages 集合 - 套餐明细
// 注意：productId 需要在创建 products 后填入对应的 _id
// ============================================================
const packageData = {
    productId: '（填入春季助长套餐的 _id）',
    items: [
        { name: '泡浴', count: 5 },
        { name: '推拿', count: 6 },
        { name: '敷贴', count: 9 }
    ],
    validDays: 180,
    createdAt: new Date()
}

// ============================================================
// fission_campaigns 集合 - 裂变活动
// 注意：productId 需要在创建 products 后填入「祛湿体验装」的 _id
// ============================================================
const fissionCampaignData = {
    productId: '（填入祛湿体验装的 _id）',
    productName: '祛湿体验装',
    activityPrice: 1990,
    cashbackAmount: 1590,
    limitPerUser: 1,
    totalStock: 500,
    soldCount: 0,
    newCustomers: 0,
    totalCashback: 0,
    startTime: new Date(),
    endTime: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90天后
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date()
}

// ============================================================
// 导出数据（可在云函数中使用）
// ============================================================
module.exports = {
    storeData,
    productsData,
    packageData,
    fissionCampaignData
}

console.log('='.repeat(60))
console.log('📋 示例数据定义完成')
console.log('='.repeat(60))
console.log('')
console.log('请按以下步骤导入数据：')
console.log('')
console.log('1. 在微信开发者工具中打开云开发控制台')
console.log('2. 创建以下 12 个集合：')
console.log('   stores, ai_config, pay_config, products, packages,')
console.log('   orders, order_items, fission_campaigns, fission_records,')
console.log('   tongue_reports, users, package_usage')
console.log('')
console.log('3. 在 stores 集合中添加 1 条门店记录')
console.log('4. 在 products 集合中添加 7 条商品记录')
console.log('5. 记下「祛湿体验装」和「春季助长套餐」的 _id')
console.log('6. 在 packages 集合中添加套餐明细')
console.log('7. 在 fission_campaigns 集合中添加裂变活动')
console.log('')
console.log('💡 提示：也可以通过管理后台（Step 8）来管理这些数据')
