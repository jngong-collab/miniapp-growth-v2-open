const { buildAdminAuditEntry } = require('./admin-audit')

function sanitizeStore(store) {
  if (!store) return null
  const { adminOpenids, staff, ...rest } = store
  return rest
}

function uniqueValues(list) {
  return Array.from(new Set((list || []).filter(Boolean)))
}

function toTimestamp(value) {
  if (!value) return 0
  if (typeof value === 'object' && value.$date !== undefined) return value.$date
  return Number(new Date(value)) || 0
}

function fenToYuan(value) {
  return (Number(value || 0) / 100).toFixed(2)
}

function startOfDay(date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function shiftDays(date, offset) {
  const next = new Date(date)
  next.setDate(next.getDate() + offset)
  return next
}

function formatDayKey(value) {
  const date = new Date(toTimestamp(value) || value || Date.now())
  const pad = (num) => String(num).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function formatDateTime(value) {
  const date = new Date(toTimestamp(value) || value || Date.now())
  const pad = (num) => String(num).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function orderStatusLabel(status) {
  const map = {
    pending: '待支付',
    paid: '已支付',
    completed: '已完成',
    refund_requested: '退款申请中',
    refunding: '退款处理中',
    refunded: '已退款',
    cancelled: '已取消'
  }
  return map[status] || status || '未知状态'
}

function refundStatusLabel(status) {
  const map = {
    pending: '待处理',
    approved: '已同意',
    rejected: '已驳回',
    refunded: '已退款'
  }
  return map[status] || status || '待处理'
}

function hasPackageRemaining(packageRemaining) {
  if (!packageRemaining) return true
  return Object.keys(packageRemaining).some(key => {
    if (key === 'used' || key === 'usedAt') return packageRemaining.used !== true
    return Number(packageRemaining[key] || 0) > 0
  })
}

function getOrderItemVerificationStatus(item) {
  if (!item || !item.verifyCode) return 'not_required'

  if (item.productType === 'service') {
    return item.packageRemaining && item.packageRemaining.used ? 'verified' : 'pending'
  }

  if (item.productType === 'package') {
    const remaining = item.packageRemaining || {}
    const expireAt = toTimestamp(item.packageExpireAt)
    if (expireAt && expireAt < Date.now() && hasPackageRemaining(remaining)) {
      return 'expired'
    }
    if (!hasPackageRemaining(remaining)) {
      return 'verified'
    }
    const packageItems = Array.isArray(item.packageItems) ? item.packageItems : []
    const hasConsumedUsage = packageItems.some(packageItem => {
      const total = Number(packageItem.count || 0)
      const left = Number(remaining[packageItem.name] ?? total)
      return left < total
    })
    return hasConsumedUsage ? 'partially_verified' : 'pending'
  }

  return 'pending'
}

function followupStatusLabel(status) {
  const map = {
    pending: '待跟进',
    contacted: '已联系',
    visited: '已到店',
    converted: '已成交'
  }
  return map[status] || '待跟进'
}

function leadSourceLabel(source) {
  const map = {
    tongue: 'AI 舌象',
    lottery: '幸运抽奖',
    order: '下单客户',
    fission: '分享裂变'
  }
  return map[source] || '自然到店'
}

function getLeadSourceLabel(order) {
  if (!order) return '自然到店'
  if (order.fissionCampaignId) return '裂变活动'
  return '自然到店'
}

function maskOpenid(openid) {
  if (!openid) return '匿名用户'
  return `${openid.slice(0, 3)}***${openid.slice(-3)}`
}

function paginate(list, page, pageSize) {
  const safePage = page > 0 ? page : 1
  const safePageSize = pageSize > 0 ? pageSize : 20
  const start = (safePage - 1) * safePageSize
  return {
    list: list.slice(start, start + safePageSize),
    total: list.length,
    page: safePage,
    pageSize: safePageSize
  }
}

function toMap(list, key) {
  return (list || []).reduce((acc, item) => {
    if (!item || !item[key]) return acc
    if (!acc[item[key]]) acc[item[key]] = item
    return acc
  }, {})
}

function groupBy(list, key) {
  return (list || []).reduce((acc, item) => {
    const value = item && item[key]
    if (!value) return acc
    if (!acc[value]) acc[value] = []
    acc[value].push(item)
    return acc
  }, {})
}

function splitPlainList(value) {
  if (!value) return []
  return String(value).split(/[\n,，]/).map(item => item.trim()).filter(Boolean)
}

function buildAuditRecord(access, payload, serverDate) {
  return buildAdminAuditEntry({
    actorUid: access.uid,
    actorName: access.account.displayName || access.account.username,
    storeId: access.account.storeId || access.store._id,
    ...payload
  }, serverDate)
}

module.exports = {
  sanitizeStore,
  uniqueValues,
  toTimestamp,
  fenToYuan,
  startOfDay,
  shiftDays,
  formatDayKey,
  formatDateTime,
  orderStatusLabel,
  refundStatusLabel,
  hasPackageRemaining,
  getOrderItemVerificationStatus,
  followupStatusLabel,
  leadSourceLabel,
  getLeadSourceLabel,
  maskOpenid,
  paginate,
  toMap,
  groupBy,
  splitPlainList,
  buildAuditRecord
}
