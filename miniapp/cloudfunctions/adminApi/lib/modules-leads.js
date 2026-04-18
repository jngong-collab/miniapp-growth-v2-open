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

const DAY_MS = 24 * 60 * 60 * 1000
const LOGIN_TREND_DAYS = {
  ACTIVE: 7,
  WARMUP: 30
}

function splitTagsInput(value) {
  if (!value) return []
  if (Array.isArray(value)) {
    return [...new Set(value.map(item => String(item || '').trim()).filter(Boolean))]
  }
  return [...new Set(String(value).split(/[，,\n]/).map(item => item.trim()).filter(Boolean))]
}

function resolveLoginStatus(user, now = Date.now()) {
  const explicitStatus = String(user.loginStatus || '').trim().toLowerCase()
  if (explicitStatus === 'active' || explicitStatus === 'logged_in') {
    return {
      loginStatus: 'active',
      loginStatusLabel: '已登录',
      isLoggedIn: true
    }
  }
  if (explicitStatus === 'inactive' || explicitStatus === 'logged_out') {
    return {
      loginStatus: 'inactive',
      loginStatusLabel: '未登录',
      isLoggedIn: false
    }
  }

  const loginTs = toTimestamp(user.lastLoginAt)
  if (!loginTs) {
    return {
      loginStatus: 'never',
      loginStatusLabel: '未登录',
      isLoggedIn: false
    }
  }

  const age = now - loginTs
  if (age <= LOGIN_TREND_DAYS.ACTIVE * DAY_MS) {
    return {
      loginStatus: 'active',
      loginStatusLabel: '近期登录',
      isLoggedIn: true
    }
  }
  if (age <= LOGIN_TREND_DAYS.WARMUP * DAY_MS) {
    return {
      loginStatus: 'inactive',
      loginStatusLabel: '近期未登录',
      isLoggedIn: false
    }
  }

  return {
    loginStatus: 'inactive',
    loginStatusLabel: '长期未登录',
    isLoggedIn: false
  }
}

function resolveMemberOwnerName(memberOwnerStaffOpenid, userOwnerName, staffNameMap) {
  if (memberOwnerStaffOpenid && userOwnerName) return userOwnerName
  if (memberOwnerStaffOpenid && staffNameMap[memberOwnerStaffOpenid]) return staffNameMap[memberOwnerStaffOpenid]
  return ''
}

function normalizeCustomerRecord(user, options = {}) {
  const {
    tongueByOpenid = {},
    followupByOpenid = {},
    staffNameByOpenid = {}
  } = options
  const openid = user._openid || ''
  const memberTags = splitTagsInput(user.memberTags)
  const ownerOpenid = String(user.memberOwnerStaffOpenid || '').trim()
  const ownerName = resolveMemberOwnerName(ownerOpenid, user.memberOwnerStaffName || '', staffNameByOpenid)
  const tongue = tongueByOpenid[openid] || { count: 0, lastTongueAt: null }
  const followup = followupByOpenid[openid] || {}
  const loginState = resolveLoginStatus(user)

  return {
    _openid: openid,
    nickName: user.nickName || '',
    avatarUrl: user.avatarUrl || '',
    phone: user.phone || '',
    phoneBound: Boolean(user.phone && String(user.phone).trim()),
    phoneBoundAt: user.phoneBoundAt || null,
    profileCompleted: user.profileCompleted === true,
    balance: Number(user.balance || 0),
    balanceYuan: fenToYuan(user.balance || 0),
    totalEarned: Number(user.totalEarned || 0),
    totalEarnedYuan: fenToYuan(user.totalEarned || 0),
    totalInvited: Number(user.totalInvited || 0),
    memberLevel: user.memberLevel || 'normal',
    memberLevelLabel: user.memberLevel === 'vip' ? 'VIP' : (user.memberLevel === 'svip' ? 'SVIP' : '普通会员'),
    memberNote: user.memberNote || '',
    memberTagsText: memberTags.join('，'),
    memberTags,
    memberOwnerStaffOpenid: ownerOpenid,
    memberOwnerStaffName: ownerName,
    loginStatus: loginState.loginStatus,
    loginStatusLabel: loginState.loginStatusLabel,
    isLoggedIn: loginState.isLoggedIn,
    lastLoginAt: user.lastLoginAt || null,
    tongueCount: Number(tongue.count || 0),
    lastTongueAt: tongue.lastTongueAt || null,
    invitedBy: user.invitedBy || '',
    followupStatus: followup.status || 'pending',
    followupStatusLabel: followupStatusLabel(followup.status || 'pending'),
    followupLastAt: followup.updatedAt || followup.createdAt || null,
    followupLastNote: followup.note || '',
    createdAt: user.createdAt || null
  }
}

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
  // 限制线索查询范围为最近90天，避免大数据量OOM
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
  const users = await safeListByStore('users', storeId, {
    createdAt: _cmd.gte(ninetyDaysAgo)
  }, { orderBy: ['createdAt', 'desc'], limit: 500 })
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

async function listCustomers(access, event) {
  const { keyword = '', page = 1, pageSize = 20 } = event || {}
  const storeId = getAccessStoreId(access)
  const keywordText = String(keyword || '').trim().toLowerCase()

  const users = await safeList('users', { storeId }, { orderBy: ['createdAt', 'desc'], limit: 500 })
  const openids = users.map(item => item._openid).filter(Boolean)
  const staffRes = await safeGetFirst('stores', { _id: storeId })
  const [tongueReports, followups] = await Promise.all([
    openids.length
      ? safeList('tongue_reports', { _openid: _cmd.in(openids) }, { orderBy: ['createdAt', 'desc'], limit: 500 })
      : [],
    openids.length
      ? safeList('customer_followups', { storeId, leadOpenid: _cmd.in(openids) }, { orderBy: ['updatedAt', 'desc'], limit: 300 })
      : []
  ])

  const tongueByOpenid = {}
  tongueReports.forEach(item => {
    if (!item || !item._openid) return
    if (!tongueByOpenid[item._openid]) {
      tongueByOpenid[item._openid] = {
        count: 0,
        lastTongueAt: item.createdAt || null
      }
    }
    tongueByOpenid[item._openid].count += 1
  })

  const followupByOpenid = {}
  followups.forEach(item => {
    if (!item || !item.leadOpenid || followupByOpenid[item.leadOpenid]) return
    followupByOpenid[item.leadOpenid] = item
  })

  const staffNameByOpenid = {}
  const staffList = Array.isArray(staffRes?.staff) ? staffRes.staff : []
  staffList.forEach(item => {
    if (!item || !item.openid) return
    staffNameByOpenid[item.openid] = item.name || item.nickName || ''
  })

  const rows = users.map(user => normalizeCustomerRecord(user, {
    tongueByOpenid,
    followupByOpenid,
    staffNameByOpenid
  })).filter(user => {
    if (!keywordText) return true
    const haystack = [
      user.nickName,
      user.phone,
      user._openid,
      user.memberOwnerStaffName,
      user.memberTagsText
    ].join(' ').toLowerCase()
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
  const staffRes = await safeGetFirst('stores', { _id: storeId })

  const [orders, followups, tongueReports] = await Promise.all([
    safeList('orders', { _openid: openid, storeId }, { orderBy: ['createdAt', 'desc'], limit: 20 }),
    safeList('customer_followups', { leadOpenid: openid, storeId }, { orderBy: ['updatedAt', 'desc'], limit: 50 }),
    safeList('tongue_reports', { _openid: openid, storeId }, { orderBy: ['createdAt', 'desc'], limit: 20 })
  ])

  const staffNameByOpenid = {}
  const staffList = Array.isArray(staffRes?.staff) ? staffRes.staff : []
  staffList.forEach(item => {
    if (!item || !item.openid) return
    staffNameByOpenid[item.openid] = item.name || item.nickName || ''
  })

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
      ...normalizeCustomerRecord(user, { staffNameByOpenid }),
      recentOrders,
      followupEvents,
      recentTongueReports: tongueReports.map(item => ({
        _id: item._id || '',
        createdAt: item.createdAt || null,
        isReviewMode: Boolean(item.isReviewMode),
        conclusion: item.result && String(item.result.conclusion || '').trim()
          ? String(item.result.conclusion || '').trim()
          : String((item.result && item.result.analysis_details) || '').trim() || '未提炼结论',
        analysisDetails: item.result && String(item.result.analysis_details || '').trim()
          ? String(item.result.analysis_details || '').trim()
          : String((item.result && item.result.conclusion) || '').trim() || ''
      }))
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

async function updateCustomer(access, event) {
  const {
    openid = '',
    memberLevel,
    memberNote,
    memberTags,
    memberOwnerStaffOpenid,
    memberOwnerStaffName
  } = event || {}
  if (!openid) return { code: -1, msg: '缺少用户标识' }

  const storeId = getAccessStoreId(access)
  const user = await safeGetFirst('users', { _openid: openid, storeId })
  if (!user) return { code: -1, msg: '用户不存在或无权限操作' }

  const staffRes = await safeGetFirst('stores', { _id: storeId })
  const staffNameByOpenid = {}
  const staffList = Array.isArray(staffRes?.staff) ? staffRes.staff : []
  staffList.forEach(item => {
    if (!item || !item.openid) return
    staffNameByOpenid[item.openid] = item.name || item.nickName || ''
  })

  const updatePayload = {
    updatedAt: db.serverDate()
  }

  if (typeof memberLevel === 'string' && ['normal', 'vip', 'svip'].includes(memberLevel.trim())) {
    updatePayload.memberLevel = memberLevel.trim()
  }
  if (Object.prototype.hasOwnProperty.call(event || {}, 'memberNote')) {
    updatePayload.memberNote = typeof memberNote === 'string' ? memberNote.trim() : ''
  }
  if (Object.prototype.hasOwnProperty.call(event || {}, 'memberTags')) {
    updatePayload.memberTags = splitTagsInput(memberTags)
  }
  if (Object.prototype.hasOwnProperty.call(event || {}, 'memberOwnerStaffOpenid')) {
    const targetOpenid = String(memberOwnerStaffOpenid || '').trim()
    if (targetOpenid) {
      const mappedName = resolveMemberOwnerName(targetOpenid, String(memberOwnerStaffName || '').trim(), staffNameByOpenid)
      updatePayload.memberOwnerStaffOpenid = targetOpenid
      updatePayload.memberOwnerStaffName = mappedName
    } else {
      updatePayload.memberOwnerStaffOpenid = ''
      updatePayload.memberOwnerStaffName = ''
    }
  } else if (Object.prototype.hasOwnProperty.call(event || {}, 'memberOwnerStaffName')) {
    updatePayload.memberOwnerStaffName = String(memberOwnerStaffName || '').trim()
  }

  if (Object.keys(updatePayload).length === 1) {
    return { code: -1, msg: '未检测到可更新字段' }
  }

  await db.collection('users').doc(user._id).update({ data: updatePayload })

  await writeAuditLog(access, {
    action: 'leads.updateCustomer',
    module: 'leads',
    targetType: 'user',
    targetId: openid,
    summary: `更新客户资料 ${openid}`,
    detail: {
      memberLevel: updatePayload.memberLevel,
      memberNote: updatePayload.memberNote,
      memberTags: updatePayload.memberTags,
      memberOwnerStaffOpenid: updatePayload.memberOwnerStaffOpenid,
      memberOwnerStaffName: updatePayload.memberOwnerStaffName
    }
  })

  return { code: 0, msg: '更新成功' }
}

module.exports = {
  listLeads,
  saveFollowup,
  exportLeads,
  listCustomers,
  getCustomerDetail,
  listFollowupEvents,
  updateCustomer
}
