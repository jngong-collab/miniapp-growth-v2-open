const { db, _cmd } = require('./context')
const {
  getAccessStoreId,
  safeGetFirst,
  safeList,
  safeListByStore,
  fetchUsersMap,
  writeAuditLog
} = require('./data')
const {
  leadSourceLabel,
  followupStatusLabel,
  orderStatusLabel,
  paginate,
  toMap,
  toTimestamp,
  formatDateTime,
  fenToYuan
} = require('./helpers')

function mergeLeadTrack(leadMap, openid, source, timestamp) {
  if (!openid) return
  if (!leadMap[openid]) {
    leadMap[openid] = { sources: [], lastActivityAt: timestamp }
  }
  if (!leadMap[openid].sources.includes(source)) {
    leadMap[openid].sources.push(source)
  }
  if (toTimestamp(timestamp) > toTimestamp(leadMap[openid].lastActivityAt)) {
    leadMap[openid].lastActivityAt = timestamp
  }
}

async function listLeads(access, event) {
  const { source = 'all', followupStatus = 'all', keyword = '', page = 1, pageSize = 20 } = event
  const storeId = getAccessStoreId(access)
  const users = await safeListByStore('users', storeId, {}, { orderBy: ['createdAt', 'desc'], limit: 500 })
  const openids = users.map(item => item._openid).filter(Boolean)
  const campaignIds = (await safeList('fission_campaigns', { storeId }, {
    orderBy: ['createdAt', 'desc'],
    limit: 100
  })).map(item => item._id).filter(Boolean)

  const [tongueReports, lotteryRecords, orders, fissionRecords, followups] = await Promise.all([
    openids.length
      ? safeList('tongue_reports', { _openid: _cmd.in(openids) }, { orderBy: ['createdAt', 'desc'], limit: 200 })
      : [],
    openids.length
      ? safeList('lottery_records', { _openid: _cmd.in(openids) }, { orderBy: ['createdAt', 'desc'], limit: 200 })
      : [],
    safeList('orders', {
      storeId,
      status: _cmd.in(['paid', 'completed', 'refund_requested', 'refunding', 'refunded'])
    }, { orderBy: ['createdAt', 'desc'], limit: 300 }),
    campaignIds.length
      ? safeList('fission_records', { campaignId: _cmd.in(campaignIds) }, { orderBy: ['createdAt', 'desc'], limit: 300 })
      : [],
    openids.length
      ? safeList('customer_followups', { storeId, leadOpenid: _cmd.in(openids) }, { orderBy: ['updatedAt', 'desc'], limit: 300 })
      : []
  ])

  const leadMap = {}
  const followupMap = toMap(followups, 'leadOpenid')

  tongueReports.forEach(item => mergeLeadTrack(leadMap, item._openid, 'tongue', item.createdAt))
  lotteryRecords.forEach(item => mergeLeadTrack(leadMap, item._openid, 'lottery', item.createdAt))
  orders.forEach(item => mergeLeadTrack(leadMap, item._openid, 'order', item.createdAt))
  fissionRecords.forEach(item => mergeLeadTrack(leadMap, item.inviteeOpenid, 'fission', item.createdAt))

  const usersMap = await fetchUsersMap(Object.keys(leadMap))
  const keywordText = String(keyword || '').trim().toLowerCase()

  const records = Object.keys(leadMap).map(openid => {
    const lead = leadMap[openid]
    const followup = followupMap[openid] || {}
    const user = usersMap[openid] || {}
    return {
      _openid: openid,
      nickName: user.nickName || '',
      avatarUrl: user.avatarUrl || '',
      phone: user.phone || '',
      primarySourceKey: lead.sources[0] || 'order',
      primarySourceLabel: leadSourceLabel(lead.sources[0]),
      tracks: lead.sources,
      tracksLabel: lead.sources.map(leadSourceLabel),
      lastActivityAt: lead.lastActivityAt,
      followupStatus: followup.status || 'pending',
      followupStatusLabel: followupStatusLabel(followup.status || 'pending'),
      followupNote: followup.note || ''
    }
  }).filter(item => {
    if (source !== 'all' && item.tracks.indexOf(source) === -1) return false
    if (followupStatus !== 'all' && item.followupStatus !== followupStatus) return false
    if (keywordText) {
      const haystacks = [item.nickName, item.phone, item.followupNote, item._openid].join(' ').toLowerCase()
      if (!haystacks.includes(keywordText)) return false
    }
    return true
  }).sort((a, b) => toTimestamp(b.lastActivityAt) - toTimestamp(a.lastActivityAt))

  return { code: 0, data: paginate(records, Number(page || 1), Number(pageSize || 20)) }
}

async function saveFollowup(access, event) {
  const { leadOpenid = '', status = 'pending', note = '' } = event
  if (!leadOpenid) return { code: -1, msg: '缺少线索用户' }
  const storeId = getAccessStoreId(access)
  const user = await safeGetFirst('users', { _openid: leadOpenid, storeId })
  if (!user) return { code: -1, msg: '无权限操作该门店客户' }

  const existing = await db.collection('customer_followups').where({ leadOpenid, storeId }).limit(1).get().then(res => res.data[0] || null).catch(() => null)
  const payload = {
    storeId,
    leadOpenid,
    status,
    note,
    operatorUid: access.uid,
    operatorName: access.account.displayName || access.account.username,
    updatedAt: db.serverDate()
  }

  if (existing) {
    await db.collection('customer_followups').doc(existing._id).update({ data: payload })
  } else {
    await db.collection('customer_followups').add({
      data: { ...payload, createdAt: db.serverDate() }
    })
  }

  await writeAuditLog(access, {
    action: 'leads.saveFollowup',
    module: 'leads',
    targetType: 'lead',
    targetId: leadOpenid,
    summary: `更新客户跟进 ${leadOpenid}`,
    detail: { status, note }
  })

  return { code: 0, msg: '跟进已更新' }
}

async function exportLeads(access, event) {
  const listRes = await listLeads(access, { ...event, page: 1, pageSize: 500 })
  if (listRes.code) return listRes
  return {
    code: 0,
    data: (listRes.data.list || []).map(item => ({
      nickName: item.nickName,
      phone: item.phone,
      primarySource: item.primarySourceLabel,
      allSources: item.tracksLabel.join('、'),
      followupStatus: item.followupStatusLabel,
      followupNote: item.followupNote,
      lastActivityAt: formatDateTime(item.lastActivityAt)
    }))
  }
}

function normalizeCustomerRecord(user) {
  return {
    _openid: user._openid || '',
    nickName: user.nickName || '',
    avatarUrl: user.avatarUrl || '',
    phone: user.phone || '',
    balance: Number(user.balance || 0),
    balanceYuan: fenToYuan(user.balance || 0),
    totalEarned: Number(user.totalEarned || 0),
    totalEarnedYuan: fenToYuan(user.totalEarned || 0),
    totalInvited: Number(user.totalInvited || 0),
    memberLevel: user.memberLevel || 'normal',
    memberLevelLabel: user.memberLevel === 'vip' ? 'VIP' : '普通会员',
    invitedBy: user.invitedBy || '',
    createdAt: user.createdAt || null
  }
}

async function listCustomers(access, event) {
  const { keyword = '', page = 1, pageSize = 20 } = event || {}
  const storeId = getAccessStoreId(access)
  const keywordText = String(keyword || '').trim().toLowerCase()

  const users = await safeList('users', { storeId }, { orderBy: ['createdAt', 'desc'], limit: 500 })
  const rows = users.map(normalizeCustomerRecord).filter(user => {
    if (!keywordText) return true
    const haystack = [user.nickName, user.phone, user._openid].join(' ').toLowerCase()
    return haystack.includes(keywordText)
  }).sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt))

  return { code: 0, data: paginate(rows, Number(page || 1), Number(pageSize || 20)) }
}

async function getCustomerDetail(access, event) {
  const openid = String((event && event.openid) || '').trim()
  if (!openid) return { code: -1, msg: '缺少用户标识' }
  const storeId = getAccessStoreId(access)

  const user = await safeGetFirst('users', { _openid: openid, storeId })
  if (!user) return { code: -1, msg: '用户不存在' }

  const [orders, followups] = await Promise.all([
    safeList('orders', { _openid: openid, storeId }, { orderBy: ['createdAt', 'desc'], limit: 20 }),
    safeList('customer_followups', { leadOpenid: openid, storeId }, { orderBy: ['updatedAt', 'desc'], limit: 50 })
  ])

  const recentOrders = orders.map(order => ({
    _id: order._id,
    orderNo: order.orderNo || '',
    totalAmount: Number(order.totalAmount || 0),
    totalAmountYuan: fenToYuan(order.totalAmount || 0),
    status: order.status || '',
    statusLabel: orderStatusLabel(order.status),
    createdAt: order.createdAt
  }))

  const followupEvents = followups.map(item => ({
    status: item.status || 'pending',
    statusLabel: followupStatusLabel(item.status || 'pending'),
    note: item.note || '',
    operatorName: item.operatorName || '',
    updatedAt: item.updatedAt || item.createdAt
  }))

  return {
    code: 0,
    data: {
      ...normalizeCustomerRecord(user),
      recentOrders,
      followupEvents
    }
  }
}

async function listFollowupEvents(access, event) {
  const openid = String((event && event.openid) || '').trim()
  if (!openid) return { code: -1, msg: '缺少用户标识' }
  const storeId = getAccessStoreId(access)

  const followups = await safeList('customer_followups', { leadOpenid: openid, storeId }, { orderBy: ['updatedAt', 'desc'], limit: 50 })
  const rows = followups.map(item => ({
    status: item.status || 'pending',
    statusLabel: followupStatusLabel(item.status || 'pending'),
    note: item.note || '',
    operatorName: item.operatorName || '',
    updatedAt: item.updatedAt || item.createdAt
  }))

  return { code: 0, data: rows }
}

module.exports = {
  listLeads,
  saveFollowup,
  exportLeads,
  listCustomers,
  getCustomerDetail,
  listFollowupEvents
}
