const { db, _cmd } = require('./context')
const { getAccessStoreId, safeGetById, safeList, writeAuditLog } = require('./data')
const { fenToYuan, paginate, splitPlainList } = require('./helpers')

function normalizeFissionPayload(payload) {
  return {
    _id: payload._id || '',
    productId: String(payload.productId || '').trim(),
    productName: String(payload.productName || '').trim(),
    activityPrice: Number(payload.activityPrice || 0),
    cashbackAmount: Number(payload.cashbackAmount || 0),
    limitPerUser: Number(payload.limitPerUser || 1),
    totalStock: Number(payload.totalStock || 0),
    soldCount: Number(payload.soldCount || 0),
    newCustomers: Number(payload.newCustomers || 0),
    totalCashback: Number(payload.totalCashback || 0),
    status: payload.status || 'draft',
    startTime: payload.startTime ? new Date(payload.startTime) : null,
    endTime: payload.endTime ? new Date(payload.endTime) : null
  }
}

function normalizeLotteryPayload(payload) {
  return {
    _id: payload._id || '',
    name: String(payload.name || '').trim(),
    status: payload.status || 'draft',
    startTime: payload.startTime ? new Date(payload.startTime) : null,
    endTime: payload.endTime ? new Date(payload.endTime) : null,
    dailyLimitPerUser: Number(payload.dailyLimitPerUser || 3),
    rules: Array.isArray(payload.rules) ? payload.rules.filter(Boolean) : splitPlainList(payload.rules),
    prizes: (payload.prizes || []).map(item => ({
      name: String(item.name || '').trim(),
      weight: Number(item.weight || 0),
      stock: Number(item.stock || 0),
      description: String(item.description || '').trim()
    })).filter(item => item.name && item.weight > 0)
  }
}

async function listCampaigns(access) {
  const storeId = getAccessStoreId(access)
  const [fissionCampaigns, lotteryCampaigns] = await Promise.all([
    safeList('fission_campaigns', { storeId }, { orderBy: ['createdAt', 'desc'], limit: 100 }),
    safeList('lottery_campaigns', { storeId }, { orderBy: ['createdAt', 'desc'], limit: 100 })
  ])
  const lotteryCampaignIds = lotteryCampaigns.map(item => item._id).filter(Boolean)
  const lotteryRecords = lotteryCampaignIds.length
    ? await safeList('lottery_records', { campaignId: _cmd.in(lotteryCampaignIds) }, { orderBy: ['createdAt', 'desc'], limit: 500 })
    : []

  const lotteryStats = lotteryRecords.reduce((acc, item) => {
    if (!item.campaignId) return acc
    if (!acc[item.campaignId]) acc[item.campaignId] = { entryCount: 0, winCount: 0 }
    acc[item.campaignId].entryCount += 1
    if (item.prizeName) acc[item.campaignId].winCount += 1
    return acc
  }, {})

  return {
    code: 0,
    data: {
      fissionCampaigns,
      lotteryCampaigns: lotteryCampaigns.map(item => ({
        ...item,
        entryCount: lotteryStats[item._id] ? lotteryStats[item._id].entryCount : 0,
        winCount: lotteryStats[item._id] ? lotteryStats[item._id].winCount : 0
      }))
    }
  }
}

async function saveFission(access, event) {
  const storeId = getAccessStoreId(access)
  const payload = normalizeFissionPayload(event.payload || {})
  if (!payload.productId) return { code: -1, msg: '请选择关联商品' }
  const product = await safeGetById('products', payload.productId)
  if (!product) return { code: -1, msg: '关联商品不存在' }
  if (product.storeId && product.storeId !== storeId) {
    return { code: -1, msg: '无权限使用该商品' }
  }
  payload.productName = product.name
  payload.updatedAt = db.serverDate()
  if (!payload.startTime || !payload.endTime) return { code: -1, msg: '请选择活动时间' }

  const existing = payload._id ? await safeGetById('fission_campaigns', payload._id) : null
  if (existing && existing.storeId && existing.storeId !== storeId) {
    return { code: -1, msg: '无权限编辑该活动' }
  }
  if (existing) {
    const campaignId = payload._id
    delete payload._id
    await db.collection('fission_campaigns').doc(campaignId).update({ data: payload })
    const updated = await safeGetById('fission_campaigns', campaignId)
    await writeAuditLog(access, {
      action: 'campaigns.saveFission',
      module: 'campaigns',
      targetType: 'fission_campaign',
      targetId: campaignId,
      summary: `更新裂变活动 ${updated.productName}`,
      detail: { before: existing, after: updated }
    })
    return { code: 0, data: updated, msg: '裂变活动已更新' }
  }

  delete payload._id
  const addRes = await db.collection('fission_campaigns').add({
    data: {
      storeId,
      soldCount: 0,
      newCustomers: 0,
      totalCashback: 0,
      ...payload,
      createdAt: db.serverDate()
    }
  })
  const created = await safeGetById('fission_campaigns', addRes._id)
  await writeAuditLog(access, {
    action: 'campaigns.saveFission',
    module: 'campaigns',
    targetType: 'fission_campaign',
    targetId: addRes._id,
    summary: `新增裂变活动 ${created.productName}`,
    detail: { after: created }
  })
  return { code: 0, data: created, msg: '裂变活动已创建' }
}

async function saveLottery(access, event) {
  const storeId = getAccessStoreId(access)
  const payload = normalizeLotteryPayload(event.payload || {})
  if (!payload.name) return { code: -1, msg: '请输入活动名称' }
  if (!payload.startTime || !payload.endTime) return { code: -1, msg: '请选择活动时间' }

  const existing = payload._id ? await safeGetById('lottery_campaigns', payload._id) : null
  if (existing && existing.storeId && existing.storeId !== storeId) {
    return { code: -1, msg: '无权限编辑该活动' }
  }
  if (existing) {
    const campaignId = payload._id
    delete payload._id
    await db.collection('lottery_campaigns').doc(campaignId).update({
      data: { ...payload, updatedAt: db.serverDate() }
    })
    const updated = await safeGetById('lottery_campaigns', campaignId)
    await writeAuditLog(access, {
      action: 'campaigns.saveLottery',
      module: 'campaigns',
      targetType: 'lottery_campaign',
      targetId: campaignId,
      summary: `更新抽奖活动 ${updated.name}`,
      detail: { before: existing, after: updated }
    })
    return { code: 0, data: updated, msg: '抽奖活动已更新' }
  }

  delete payload._id
  const addRes = await db.collection('lottery_campaigns').add({
    data: {
      storeId,
      ...payload,
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  })
  const created = await safeGetById('lottery_campaigns', addRes._id)
  await writeAuditLog(access, {
    action: 'campaigns.saveLottery',
    module: 'campaigns',
    targetType: 'lottery_campaign',
    targetId: addRes._id,
    summary: `新增抽奖活动 ${created.name}`,
    detail: { after: created }
  })
  return { code: 0, data: created, msg: '抽奖活动已创建' }
}

async function toggleStatus(access, event) {
  const storeId = getAccessStoreId(access)
  const { campaignType = '', campaignId = '', status = '' } = event
  if (!campaignId || !['active', 'paused', 'draft', 'ended'].includes(status)) {
    return { code: -1, msg: '参数错误' }
  }
  const collectionName = campaignType === 'lottery' ? 'lottery_campaigns' : 'fission_campaigns'
  const campaign = await safeGetById(collectionName, campaignId)
  if (!campaign) return { code: -1, msg: '活动不存在' }
  if (campaign.storeId && campaign.storeId !== storeId) {
    return { code: -1, msg: '无权限编辑该活动' }
  }

  await db.collection(collectionName).doc(campaignId).update({
    data: { status, updatedAt: db.serverDate() }
  })
  const updated = await safeGetById(collectionName, campaignId)
  await writeAuditLog(access, {
    action: 'campaigns.toggleStatus',
    module: 'campaigns',
    targetType: campaignType || 'fission_campaign',
    targetId: campaignId,
    summary: `${status === 'active' ? '启用' : '更新状态'}活动 ${campaign.name || campaign.productName || campaignId}`,
    detail: { status }
  })
  return { code: 0, data: updated, msg: '活动状态已更新' }
}

async function getFissionDetail(access, event) {
  const storeId = getAccessStoreId(access)
  const { campaignId = '' } = event || {}
  if (!campaignId) return { code: -1, msg: '缺少活动 ID' }

  const campaign = await safeGetById('fission_campaigns', campaignId)
  if (!campaign) return { code: -1, msg: '活动不存在' }
  if (campaign.storeId && campaign.storeId !== storeId) {
    return { code: -1, msg: '无权限查看该活动' }
  }

  const records = await safeList('fission_records', { campaignId }, { orderBy: ['createdAt', 'desc'], limit: 500 })
  return {
    code: 0,
    data: {
      ...campaign,
      activityPriceYuan: fenToYuan(campaign.activityPrice || 0),
      cashbackAmountYuan: fenToYuan(campaign.cashbackAmount || 0),
      totalCashbackYuan: fenToYuan(campaign.totalCashback || 0),
      entryCount: records.length,
      paidCount: records.filter(r => r.status === 'paid').length
    }
  }
}

async function listFissionRecords(access, event) {
  const storeId = getAccessStoreId(access)
  const { campaignId = '', page = 1, pageSize = 20 } = event || {}
  if (!campaignId) return { code: -1, msg: '缺少活动 ID' }

  const campaign = await safeGetById('fission_campaigns', campaignId)
  if (!campaign) return { code: -1, msg: '活动不存在' }
  if (campaign.storeId && campaign.storeId !== storeId) {
    return { code: -1, msg: '无权限查看该活动' }
  }

  const records = await safeList('fission_records', { campaignId }, { orderBy: ['createdAt', 'desc'], limit: 500 })
  const inviterOpenids = Array.from(new Set(records.map(r => r.inviterOpenid).filter(Boolean)))
  const users = inviterOpenids.length ? await safeList('users', { _openid: _cmd.in(inviterOpenids) }, { limit: inviterOpenids.length }) : []
  const userMap = users.reduce((acc, user) => {
    acc[user._openid] = user
    return acc
  }, {})

  const rows = records.map(record => ({
    _id: record._id,
    inviterOpenid: record.inviterOpenid,
    inviteeOpenid: record.inviteeOpenid,
    orderId: record.orderId,
    cashbackAmount: Number(record.cashbackAmount || 0),
    cashbackAmountYuan: fenToYuan(record.cashbackAmount || 0),
    status: record.status || 'paid',
    inviterLabel: userMap[record.inviterOpenid]?.nickName || record.inviterOpenid,
    createdAt: record.createdAt
  }))

  return { code: 0, data: paginate(rows, Number(page || 1), Number(pageSize || 20)) }
}

module.exports = {
  listCampaigns,
  saveFission,
  saveLottery,
  toggleStatus,
  getFissionDetail,
  listFissionRecords
}
