const { safeList, safeCount, fetchOrdersMap, _cmd } = require('./data')
const {
  startOfDay,
  shiftDays,
  formatDayKey,
  toTimestamp
} = require('./helpers')

function hasPackageRemaining(packageRemaining) {
  if (!packageRemaining) return true
  return Object.keys(packageRemaining).some(key => {
    if (key === 'used') return packageRemaining[key] !== true
    return Number(packageRemaining[key] || 0) > 0
  })
}

async function getPendingVerifyCount() {
  const items = await safeList('order_items', {
    productType: _cmd.in(['service', 'package'])
  }, { limit: 400 })
  if (!items.length) return 0

  const orderMap = await fetchOrdersMap(items.map(item => item.orderId))
  return items.filter(item => {
    const order = orderMap[item.orderId]
    if (!order || !['paid', 'completed'].includes(order.status)) return false
    if (item.productType === 'service') {
      return !(item.packageRemaining && item.packageRemaining.used)
    }
    return hasPackageRemaining(item.packageRemaining)
  }).length
}

async function countLeadEvents(sinceDate) {
  const [tongueCount, lotteryCount, fissionCount] = await Promise.all([
    safeCount('tongue_reports', { createdAt: _cmd.gte(sinceDate) }),
    safeCount('lottery_records', { createdAt: _cmd.gte(sinceDate) }),
    safeCount('fission_records', { createdAt: _cmd.gte(sinceDate) })
  ])
  return tongueCount + lotteryCount + fissionCount
}

function sumAmount(orders) {
  return orders.reduce((sum, item) => sum + Number(item.payAmount || item.totalAmount || 0), 0)
}

async function getOverview() {
  const today = startOfDay(new Date())
  const sevenDaysAgo = shiftDays(today, -6)
  const thirtyDaysAgo = shiftDays(today, -29)

  const [orders30, items30, followups, users, pendingVerifyCount, refundPending] = await Promise.all([
    safeList('orders', { createdAt: _cmd.gte(thirtyDaysAgo) }, {
      orderBy: ['createdAt', 'desc'],
      limit: 400
    }),
    safeList('order_items', {}, { orderBy: ['createdAt', 'desc'], limit: 500 }),
    safeList('customer_followups', {}, { orderBy: ['updatedAt', 'desc'], limit: 200 }),
    safeList('users', {}, { orderBy: ['createdAt', 'desc'], limit: 200 }),
    getPendingVerifyCount(),
    safeCount('refund_requests', { status: 'pending' })
  ])

  const paidStatuses = new Set(['paid', 'completed'])
  const ordersToday = orders30.filter(item => toTimestamp(item.createdAt) >= today.getTime())
  const orders7 = orders30.filter(item => toTimestamp(item.createdAt) >= sevenDaysAgo.getTime())

  const todayPaid = ordersToday.filter(item => paidStatuses.has(item.status))
  const paid7 = orders7.filter(item => paidStatuses.has(item.status))
  const paid30 = orders30.filter(item => paidStatuses.has(item.status))
  const refundingCount = orders30.filter(item => ['refund_requested', 'refunding'].includes(item.status)).length
  const fissionPaid7 = paid7.filter(item => item.fissionCampaignId).length
  const leadEvents7 = await countLeadEvents(sevenDaysAgo)
  const conversionRate7 = leadEvents7 ? Math.round((paid7.length / leadEvents7) * 100) : 0

  const productStats = {}
  items30.forEach(item => {
    if (!item || !item.productId) return
    if (!productStats[item.productId]) {
      productStats[item.productId] = {
        productId: item.productId,
        productName: item.productName || '未命名商品',
        revenue: 0,
        quantity: 0
      }
    }
    productStats[item.productId].revenue += Number(item.totalAmount || (item.price || 0) * (item.quantity || 1))
    productStats[item.productId].quantity += Number(item.quantity || 0)
  })

  const hotProducts = Object.values(productStats)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6)

  const fissionCampaigns = await safeList('fission_campaigns', {}, { orderBy: ['soldCount', 'desc'], limit: 6 })
  const hotCampaigns = fissionCampaigns.map(item => ({
    _id: item._id,
    name: item.productName || '裂变活动',
    status: item.status || 'draft',
    soldCount: Number(item.soldCount || 0),
    totalCashback: Number(item.totalCashback || 0),
    newCustomers: Number(item.newCustomers || 0)
  }))

  return {
    code: 0,
    data: {
      metrics: {
        gmvToday: sumAmount(todayPaid),
        gmv7d: sumAmount(paid7),
        gmv30d: sumAmount(paid30),
        paidOrderToday: todayPaid.length,
        paidOrder7d: paid7.length,
        refundPending,
        refundingCount,
        pendingVerifyCount,
        fissionPaid7,
        leadEvents7,
        conversionRate7,
        customerCount: users.length,
        followupPending: followups.filter(item => !item.status || item.status === 'pending').length
      },
      hotProducts,
      hotCampaigns
    }
  }
}

async function getTrends(access, event) {
  const range = event.range === '7d' ? 7 : 30
  const today = startOfDay(new Date())
  const since = shiftDays(today, -(range - 1))
  const [orders, tongueReports, lotteryRecords, fissionRecords] = await Promise.all([
    safeList('orders', { createdAt: _cmd.gte(since) }, { orderBy: ['createdAt', 'asc'], limit: 500 }),
    safeList('tongue_reports', { createdAt: _cmd.gte(since) }, { orderBy: ['createdAt', 'asc'], limit: 300 }),
    safeList('lottery_records', { createdAt: _cmd.gte(since) }, { orderBy: ['createdAt', 'asc'], limit: 300 }),
    safeList('fission_records', { createdAt: _cmd.gte(since) }, { orderBy: ['createdAt', 'asc'], limit: 300 })
  ])

  const buckets = new Map()
  for (let i = 0; i < range; i += 1) {
    const day = shiftDays(since, i)
    const key = formatDayKey(day)
    buckets.set(key, { label: key.slice(5), orders: 0, gmv: 0, leads: 0, refunds: 0 })
  }

  orders.forEach(order => {
    const key = formatDayKey(order.createdAt)
    const bucket = buckets.get(key)
    if (!bucket) return
    if (['paid', 'completed'].includes(order.status)) {
      bucket.orders += 1
      bucket.gmv += Number(order.payAmount || order.totalAmount || 0)
    }
    if (['refund_requested', 'refunding', 'refunded'].includes(order.status)) {
      bucket.refunds += 1
    }
  })

  ;[tongueReports, lotteryRecords, fissionRecords].forEach(list => {
    list.forEach(item => {
      const bucket = buckets.get(formatDayKey(item.createdAt))
      if (bucket) bucket.leads += 1
    })
  })

  return {
    code: 0,
    data: Array.from(buckets.values())
  }
}

module.exports = {
  getOverview,
  getTrends
}
