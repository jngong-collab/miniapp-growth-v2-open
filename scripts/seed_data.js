// 初始化示例数据脚本
// 在微信开发者工具的云开发控制台中运行此脚本
// 或者创建一个临时云函数来执行
//
// 商品数据真源：catalog_data.js
// ============================================================
// 使用方法：
// 1. 在微信开发者工具中打开云开发控制台
// 2. 进入数据库面板
// 3. 依次创建以下集合（Collection）
// 4. 导入对应的示例数据
// ============================================================

/**
 * 需要创建的集合列表（当前主要涉及）：
 * - stores
 * - ai_config
 * - pay_config
 * - products
 * - fission_campaigns
 *
 * 其他集合（orders, order_items, fission_records,
 * tongue_reports, users, package_usage, packages）
 * 按业务需要后续再行创建即可。
 */

// ============================================================
// stores 集合 - 门店信息（导入 1 条）
// ============================================================
const { allProductsData, fissionCampaigns, retainedFissionProduct } = require('./catalog_data')

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
// 数据来自 catalog_data.js，此处补充 createdAt / updatedAt
// ============================================================
const productsData = allProductsData.map(p => ({
    ...p,
    createdAt: new Date(),
    updatedAt: new Date()
}))

// ============================================================
// packages 集合 - 套餐明细
// 当前商品目录无套餐明细数据，故保留为 null
// ============================================================
const packageData = null

// ============================================================
// fission_campaigns 集合 - 裂变活动
// 注意：productId 需要在创建 products 后填入「脾胃养护推拿」的 _id
// ============================================================
const baseFissionCampaign = (fissionCampaigns && fissionCampaigns[0]) || {
    productId: '（填入脾胃养护推拿的 _id）',
    productName: retainedFissionProduct ? retainedFissionProduct.name : '脾胃养护推拿',
    activityPrice: 2990,
    cashbackAmount: 1990,
    limitPerUser: 1,
    totalStock: 500,
    soldCount: 0,
    newCustomers: 0,
    totalCashback: 0,
    status: 'active'
}

const fissionCampaignData = {
    ...baseFissionCampaign,
    startTime: new Date(),
    endTime: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90天后
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
console.log('2. 创建以下集合：')
console.log('   stores, ai_config, pay_config, products, fission_campaigns')
console.log('')
console.log('3. 在 stores 集合中添加 1 条门店记录')
console.log('4. 在 products 集合中添加 45 条商品记录（44 商城商品 + 1 裂变商品）')
console.log('5. 记下「脾胃养护推拿」的 _id')
console.log('6. 在 fission_campaigns 集合中添加裂变活动')
console.log('')
console.log('💡 提示：也可以通过管理后台（Step 8）来管理这些数据')
