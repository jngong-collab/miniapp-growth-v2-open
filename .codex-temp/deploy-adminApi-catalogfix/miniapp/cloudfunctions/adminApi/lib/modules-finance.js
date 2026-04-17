const { db, _cmd } = require('./context')
const { getAccessStoreId, safeList, fetchUsersMap, writeAuditLog } = require('./data')
const { fenToYuan, formatDateTime, paginate, toTimestamp, toMap, formatDayKey } = require('./helpers')

const PAID_STATUSES = ['paid', 'completed', 'refund_requested', 'refunding', 'refunded', 'shipped']

function normalizePaymentRecord(order, user = null) {
  return {
    orderId: order._id,
    orderNo: order.orderNo || '',
    userLabel: user ? (user.nickName || order._openid) : order._openid,
    userPhone: user && user.phone ? user.phone : '',
    payAmount: Number(order.payAmount || order.totalAmount || 0),
    payAmountYuan: fenToYuan(order.payAmount || order.totalAmount || 0),
    balanceUsed: Number(order.balanceUsed || 0),
    balanceUsedYuan: fenToYuan(order.balanceUsed || 0),
    paymentId: order.paymentId || '',
    status: order.status || '',
    paidAt: order.paidAt || order.createdAt,
    createdAt: order.createdAt
  }
}

function normalizeRefundRecord(request, order, user = null) {
  return {
    requestId: request._id,
    orderId: order ? order._id : request.orderId,
    orderNo: order ? (order.orderNo || '') : '',
    userLabel: user ? (user.nickName || (order ? order._openid : '')) : (order ? order._openid : ''),
    userPhone: user && user.phone ? user.phone : '',
    refundAmount: Number(request.refundAmount || (order ? order.payAmount : 0) || 0),
    refundAmountYuan: fenToYuan(request.refundAmount || (order ? order.payAmount : 0) || 0),
    status: request.status || 'pending',
    reason: request.reason || '',
    reviewedAt: request.reviewedAt || null,
    refundProcessedAt: request.refundProcessedAt || null,
    outRefundNo: request.outRefundNo || '',
    createdAt: request.createdAt
  }
}

async function listPaymentRecords(access, event) {
  const storeId = getAccessStoreId(access)
  const {
    page = 1,
    pageSize = 20,
    keyword = '',
    dateRange = []
  } = event || {}

  const [startAt, endAt] = Array.isArray(dateRange) ? dateRange : []
  const startTimestamp = startAt ? toTimestamp(startAt) : 0
  const endTimestamp = endAt ? toTimestamp(endAt) : 0
  const keywordText = String(keyword || '').trim().toLowerCase()

  const orders = await safeList('orders', {
    storeId,
    status: _cmd.in(PAID_STATUSES)
  }, { orderBy: ['createdAt', 'desc'], limit: 500 })

  const users = await fetchUsersMap(orders.map(o => o._openid))

  const rows = orders.map(order => normalizePaymentRecord(order, users[order._openid])).filter(row => {
    if (startTimestamp) {
      const ts = toTimestamp(row.paidAt)
      if (ts < startTimestamp) return false
    }
    if (endTimestamp) {
      const ts = toTimestamp(row.paidAt)
      if (ts > endTimestamp + 24 * 60 * 60 * 1000 - 1) return false
    }
    if (keywordText) {
      const haystack = [row.orderNo, row.userLabel, row.userPhone, row.paymentId].join(' ').toLowerCase()
      if (!haystack.includes(keywordText)) return false
    }
    return true
  }).sort((a, b) => toTimestamp(b.paidAt) - toTimestamp(a.paidAt))

  return { code: 0, data: paginate(rows, Number(page || 1), Number(pageSize || 20)) }
}

async function listRefundRecords(access, event) {
  const storeId = getAccessStoreId(access)
  const {
    page = 1,
    pageSize = 20,
    keyword = '',
    status = 'all',
    dateRange = []
  } = event || {}

  const [startAt, endAt] = Array.isArray(dateRange) ? dateRange : []
  const startTimestamp = startAt ? toTimestamp(startAt) : 0
  const endTimestamp = endAt ? toTimestamp(endAt) : 0
  const keywordText = String(keyword || '').trim().toLowerCase()

  const orders = await safeList('orders', { storeId }, { orderBy: ['createdAt', 'desc'], limit: 500 })
  const orderMap = toMap(orders, '_id')
  const orderIds = orders.map(o => o._id).filter(Boolean)

  if (!orderIds.length) {
    return { code: 0, data: paginate([], Number(page || 1), Number(pageSize || 20)) }
  }

  const requests = await safeList('refund_requests', {
    orderId: _cmd.in(orderIds)
  }, { orderBy: ['createdAt', 'desc'], limit: 500 })

  const users = await fetchUsersMap(orders.map(o => o._openid))

  const rows = requests.map(request => {
    const order = orderMap[request.orderId] || null
    return normalizeRefundRecord(request, order, order ? users[order._openid] : null)
  }).filter(row => {
    if (status !== 'all' && row.status !== status) return false
    if (startTimestamp) {
      const ts = toTimestamp(row.createdAt)
      if (ts < startTimestamp) return false
    }
    if (endTimestamp) {
      const ts = toTimestamp(row.createdAt)
      if (ts > endTimestamp + 24 * 60 * 60 * 1000 - 1) return false
    }
    if (keywordText) {
      const haystack = [row.orderNo, row.userLabel, row.userPhone, row.reason].join(' ').toLowerCase()
      if (!haystack.includes(keywordText)) return false
    }
    return true
  }).sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt))

  return { code: 0, data: paginate(rows, Number(page || 1), Number(pageSize || 20)) }
}

async function getReconciliationSummary(access, event) {
  const storeId = getAccessStoreId(access)
  const { dateRange = [] } = event || {}
  const [startAt, endAt] = Array.isArray(dateRange) ? dateRange : []
  const startTimestamp = startAt ? toTimestamp(startAt) : 0
  const endTimestamp = endAt ? toTimestamp(endAt) : 0

  const orders = await safeList('orders', {
    storeId,
    status: _cmd.in(PAID_STATUSES)
  }, { orderBy: ['createdAt', 'desc'], limit: 500 })

  const orderIds = orders.map(o => o._id).filter(Boolean)
  const refundRequests = orderIds.length
    ? await safeList('refund_requests', { orderId: _cmd.in(orderIds) }, { orderBy: ['createdAt', 'desc'], limit: 500 })
    : []

  let gmv = 0
  let netRevenue = 0
  let refundTotal = 0
  let orderCount = 0
  let refundCount = 0
  const dailyMap = {}

  orders.forEach(order => {
    const ts = toTimestamp(order.paidAt || order.createdAt)
    if (startTimestamp && ts < startTimestamp) return
    if (endTimestamp && ts > endTimestamp + 24 * 60 * 60 * 1000 - 1) return
    const amount = Number(order.payAmount || order.totalAmount || 0)
    gmv += amount
    netRevenue += amount
    orderCount += 1
    const day = formatDayKey(order.paidAt || order.createdAt)
    if (!dailyMap[day]) {
      dailyMap[day] = { day, gmv: 0, refund: 0, orderCount: 0 }
    }
    dailyMap[day].gmv += amount
    dailyMap[day].orderCount += 1
  })

  refundRequests.forEach(request => {
    const ts = toTimestamp(request.createdAt)
    if (startTimestamp && ts < startTimestamp) return
    if (endTimestamp && ts > endTimestamp + 24 * 60 * 60 * 1000 - 1) return
    if (['refunded', 'refunding'].includes(request.status)) {
      const amount = Number(request.refundAmount || 0)
      refundTotal += amount
      netRevenue -= amount
      refundCount += 1
      const day = formatDayKey(request.createdAt)
      if (!dailyMap[day]) {
        dailyMap[day] = { day, gmv: 0, refund: 0, orderCount: 0 }
      }
      dailyMap[day].refund += amount
    }
  })

  const daily = Object.values(dailyMap).sort((a, b) => String(a.day).localeCompare(String(b.day)))

  return {
    code: 0,
    data: {
      gmv,
      gmvYuan: fenToYuan(gmv),
      netRevenue,
      netRevenueYuan: fenToYuan(netRevenue),
      refundTotal,
      refundTotalYuan: fenToYuan(refundTotal),
      orderCount,
      refundCount,
      daily
    }
  }
}

module.exports = {
  listPaymentRecords,
  listRefundRecords,
  getReconciliationSummary
}
