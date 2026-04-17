const { db, _cmd } = require('./context')
const {
  getAccessStoreId,
  safeGetById,
  safeGetByIdAndStore,
  safeGetFirst,
  safeList,
  fetchOrdersMap,
  fetchUsersMap,
  writeAuditLog
} = require('./data')
const {
  fenToYuan,
  formatDateTime,
  orderStatusLabel,
  refundStatusLabel,
  getOrderItemVerificationStatus,
  getLeadSourceLabel,
  maskOpenid,
  paginate,
  toMap,
  groupBy,
  toTimestamp
} = require('./helpers')
const { approveRefundRequest } = require('./refund')

const VERIFICATION_STATUS_LABELS = {
  pending: '待核销',
  partially_verified: '部分核销',
  expired: '已过期',
  verified: '已核销',
  not_required: '无需核销'
}

function normalizeOrderSummary(order, items = [], user = null, refundRequest = null) {
  const productTypes = Array.from(new Set(items.map(item => item.productType || order.type).filter(Boolean)))
  const itemsSummary = items.map(item => `${item.productName || '商品'} x${item.quantity || 1}`).join('、')
  return {
    ...order,
    itemsCount: items.length,
    itemsSummary,
    productTypes,
    productName: order.productName || (items[0] ? items[0].productName : '未命名商品'),
    totalAmount: Number(order.totalAmount || order.payAmount || 0),
    totalAmountYuan: fenToYuan(order.totalAmount || order.payAmount || 0),
    statusLabel: orderStatusLabel(order.status),
    createdAtText: formatDateTime(order.createdAt),
    userLabel: user ? (user.nickName || maskOpenid(order._openid)) : maskOpenid(order._openid),
    userPhone: user && user.phone ? user.phone : '',
    leadSourceKey: order.fissionCampaignId ? 'fission' : 'order',
    leadSourceLabel: getLeadSourceLabel(order),
    refundRequest: refundRequest ? {
      ...refundRequest,
      statusLabel: refundStatusLabel(refundRequest.status)
    } : null
  }
}

function normalizeVerificationRow(order, item, user = null) {
  const verificationStatus = getOrderItemVerificationStatus(item)
  let pendingSummary = '待核销'
  if (item.productType === 'package') {
    const remaining = item.packageRemaining && typeof item.packageRemaining === 'object'
      ? Object.entries(item.packageRemaining)
        .filter(([key]) => key !== 'used')
        .map(([key, value]) => `${key} ${Number(value || 0)} 次`)
        .join('、')
      : ''
    pendingSummary = remaining || '套餐余次待核销'
  }
  return {
    orderId: order._id,
    orderNo: order.orderNo || '',
    storeId: order.storeId || '',
    orderStatus: order.status || '',
    orderStatusLabel: orderStatusLabel(order.status),
    userLabel: user ? (user.nickName || maskOpenid(order._openid)) : maskOpenid(order._openid),
    userPhone: user && user.phone ? user.phone : '',
    productId: item.productId || '',
    productName: item.productName || '未命名商品',
    productType: item.productType || '',
    verifyCode: item.verifyCode || '',
    packageItems: Array.isArray(item.packageItems) ? item.packageItems : [],
    packageRemaining: item.packageRemaining || null,
    packageExpireAt: item.packageExpireAt || null,
    verificationStatus,
    verificationStatusLabel: VERIFICATION_STATUS_LABELS[verificationStatus] || verificationStatus,
    pendingSummary,
    createdAt: item.createdAt || order.createdAt,
    createdAtText: formatDateTime(item.createdAt || order.createdAt),
    canVerify: verificationStatus !== 'verified' && verificationStatus !== 'not_required'
  }
}

function normalizeVerificationRecord(record, item, order, user = null) {
  const verificationStatus = getOrderItemVerificationStatus(item)
  return {
    usageId: record._id,
    orderItemId: record.orderItemId || '',
    orderId: order._id,
    orderNo: order.orderNo || '',
    orderStatus: order.status || '',
    orderStatusLabel: orderStatusLabel(order.status),
    userLabel: user ? (user.nickName || maskOpenid(order._openid)) : maskOpenid(order._openid),
    userPhone: user && user.phone ? user.phone : '',
    productName: item.productName || '未命名商品',
    productType: item.productType || '',
    verifyCode: item.verifyCode || '',
    serviceName: record.serviceName || '',
    operatorOpenid: record.operatorOpenid || '',
    remark: record.remark || '',
    verificationStatus,
    verificationStatusLabel: VERIFICATION_STATUS_LABELS[verificationStatus] || verificationStatus,
    createdAt: record.createdAt,
    createdAtText: formatDateTime(record.createdAt)
  }
}

function buildRefundTimeline(refundRequest, order) {
  const rows = [
    { label: '提交申请', at: refundRequest.createdAt, note: refundRequest.reason || '用户提交退款申请' }
  ]
  if (refundRequest.reviewedAt) {
    const reviewLabel = refundRequest.status === 'rejected'
      ? '已驳回'
      : refundRequest.status === 'refunding'
        ? '退款中'
        : '审核通过'
    const reviewNote = refundRequest.status === 'refunding'
      ? '退款处理中'
      : refundStatusLabel(refundRequest.status)
    rows.push({
      label: reviewLabel,
      at: refundRequest.reviewedAt,
      note: reviewNote
    })
  }
  if (refundRequest.refundProcessedAt || order.refundedAt) {
    rows.push({
      label: '退款完成',
      at: refundRequest.refundProcessedAt || order.refundedAt,
      note: refundRequest.outRefundNo || order.refundNo || ''
    })
  }
  return rows
}

async function loadOrderContext(storeId, limit = 500) {
  const orders = await safeList('orders', { storeId }, { orderBy: ['createdAt', 'desc'], limit })
  const orderIds = orders.map(item => item._id)
  if (!orderIds.length) {
    return {
      orders: [],
      refundMap: {},
      users: {},
      orderItemsMap: {}
    }
  }
  const [refundRequests, users, orderItems] = await Promise.all([
    safeList('refund_requests', { orderId: _cmd.in(orderIds) }, { orderBy: ['updatedAt', 'desc'], limit: Math.max(orderIds.length, 20) }),
    fetchUsersMap(orders.map(item => item._openid)),
    safeList('order_items', { orderId: _cmd.in(orderIds) }, { orderBy: ['createdAt', 'desc'], limit: 1200 })
  ])
  return {
    orders,
    refundMap: toMap(refundRequests, 'orderId'),
    users,
    orderItemsMap: groupBy(orderItems, 'orderId')
  }
}

async function loadVerificationQueueContext(access, limit = 500) {
  const storeId = getAccessStoreId(access)
  const orders = await safeList('orders', {
    storeId,
    status: _cmd.in(['paid', 'completed'])
  }, {
    orderBy: ['createdAt', 'desc'],
    limit
  })
  const orderIds = orders.map(item => item._id)
  if (!orderIds.length) {
    return {
      orders: [],
      users: {},
      orderItemsMap: {}
    }
  }

  const [users, orderItems] = await Promise.all([
    fetchUsersMap(orders.map(item => item._openid)),
    safeList('order_items', {
      orderId: _cmd.in(orderIds),
      productType: _cmd.in(['service', 'package'])
    }, {
      orderBy: ['createdAt', 'desc'],
      limit: Math.max(orderIds.length * 4, 100)
    })
  ])

  return {
    orders,
    users,
    orderItemsMap: groupBy(orderItems, 'orderId')
  }
}

async function loadVerificationContext(access, verifyCode) {
  const storeId = getAccessStoreId(access)
  const itemList = await safeList('order_items', {
    verifyCode,
    productType: _cmd.in(['service', 'package'])
  }, { limit: 1 })

  if (!itemList.length) {
    return { code: -1, msg: '核销码无效' }
  }

  const item = itemList[0]
  const order = await safeGetById('orders', item.orderId)

  if (!order) {
    return { code: -1, msg: '订单不存在' }
  }
  if (order.storeId !== storeId) {
    return { code: -1, msg: '无权限访问该门店订单' }
  }

  if (!['paid', 'completed'].includes(order.status)) {
    return { code: -1, msg: '订单未支付' }
  }

  return {
    code: 0,
    item,
    order
  }
}

function buildVerificationLookup(item, order) {
  return {
    orderId: order._id,
    orderNo: order.orderNo || '',
    orderStatus: order.status || '',
    productName: item.productName || '未命名商品',
    productType: item.productType || '',
    verifyCode: item.verifyCode || '',
    packageItems: Array.isArray(item.packageItems) ? item.packageItems : [],
    packageRemaining: item.packageRemaining || null,
    packageExpireAt: item.packageExpireAt || null,
    expiry: item.packageExpireAt || null,
    verificationStatus: getOrderItemVerificationStatus(item)
  }
}

async function queryVerifyCode(access, event) {
  const verifyCode = String((event && event.verifyCode) || '').trim()
  if (!verifyCode) return { code: -1, msg: '缺少核销码' }

  const verification = await loadVerificationContext(access, verifyCode)
  if (verification.code) return verification

  return {
    code: 0,
    data: buildVerificationLookup(verification.item, verification.order)
  }
}

async function listPendingVerification(access, event) {
  const {
    page = 1,
    pageSize = 20,
    keyword = '',
    status = 'all',
    productType = 'all',
    dateRange = []
  } = event

  const { orders, users, orderItemsMap } = await loadVerificationQueueContext(access, 500)
  const keywordText = String(keyword || '').trim().toLowerCase()
  const [startAt, endAt] = Array.isArray(dateRange) ? dateRange : []
  const startTimestamp = startAt ? toTimestamp(startAt) : 0
  const endTimestamp = endAt ? toTimestamp(endAt) : 0

  const rows = orders.flatMap(order => {
    const items = orderItemsMap[order._id] || []
    const user = users[order._openid] || null
    return items
      .map(item => normalizeVerificationRow(order, item, user))
      .filter(row => row.verifyCode && row.canVerify)
  }).filter(row => {
    if (status !== 'all' && row.verificationStatus !== status) return false
    if (productType !== 'all' && row.productType !== productType) return false
    if (keywordText) {
      const haystacks = [
        row.orderNo,
        row.userLabel,
        row.userPhone,
        row.productName,
        row.verifyCode,
        row.pendingSummary,
        row.orderStatusLabel
      ].join(' ').toLowerCase()
      if (!haystacks.includes(keywordText)) return false
    }
    const createdAt = toTimestamp(row.createdAt)
    if (startTimestamp && createdAt < startTimestamp) return false
    if (endTimestamp && createdAt > endTimestamp + 24 * 60 * 60 * 1000 - 1) return false
    return true
  }).sort((left, right) => toTimestamp(right.createdAt) - toTimestamp(left.createdAt))

  return {
    code: 0,
    data: paginate(rows, Number(page || 1), Number(pageSize || 20))
  }
}

async function listVerificationRecords(access, event) {
  const {
    page = 1,
    pageSize = 20,
    keyword = '',
    orderId = '',
    productType = 'all',
    serviceName = '',
    operatorOpenid = '',
    verifyCode = '',
    dateRange = []
  } = event

  const storeId = getAccessStoreId(access)
  const keywordText = String(keyword || '').trim().toLowerCase()
  const orderIdText = String(orderId || '').trim()
  const serviceNameText = String(serviceName || '').trim().toLowerCase()
  const operatorOpenidText = String(operatorOpenid || '').trim()
  const verifyCodeText = String(verifyCode || '').trim()
  const [startAt, endAt] = Array.isArray(dateRange) ? dateRange : []
  const startTimestamp = startAt ? toTimestamp(startAt) : 0
  const endTimestamp = endAt ? toTimestamp(endAt) : 0

  const storeOrders = orderIdText
    ? await safeList('orders', { _id: orderIdText, storeId }, { limit: 1 })
    : await safeList('orders', { storeId }, { orderBy: ['createdAt', 'desc'], limit: 500 })
  const orderIds = storeOrders.map(item => item._id).filter(Boolean)
  if (!orderIds.length) {
    return {
      code: 0,
      data: paginate([], Number(page || 1), Number(pageSize || 20))
    }
  }

  const orderItemsWhere = { orderId: _cmd.in(orderIds) }
  if (productType !== 'all') {
    orderItemsWhere.productType = productType
  }
  if (verifyCodeText) {
    orderItemsWhere.verifyCode = verifyCodeText
  }
  const orderItems = await safeList('order_items', orderItemsWhere, {
    orderBy: ['createdAt', 'desc'],
    limit: Math.max(orderIds.length * 4, 100)
  })
  const orderItemIds = Array.from(new Set(orderItems.map(item => item._id).filter(Boolean)))
  if (!orderItemIds.length) {
    return {
      code: 0,
      data: paginate([], Number(page || 1), Number(pageSize || 20))
    }
  }

  const recordsWhere = { orderItemId: _cmd.in(orderItemIds) }
  const records = await safeList('package_usage', recordsWhere, {
    orderBy: ['createdAt', 'desc'],
    limit: 500
  })

  if (!records.length) {
    return {
      code: 0,
      data: paginate([], Number(page || 1), Number(pageSize || 20))
    }
  }

  const hydratedOrderItemIds = Array.from(new Set(records.map(item => item.orderItemId).filter(Boolean)))
  const joinedOrderItems = hydratedOrderItemIds.length
    ? orderItems.filter(item => hydratedOrderItemIds.includes(item._id))
    : []
  const orderItemsMap = toMap(joinedOrderItems, '_id')
  const ordersMap = toMap(storeOrders, '_id')
  const users = await fetchUsersMap(Object.values(ordersMap).map(order => order._openid))

  const rows = records.map(record => {
    const item = orderItemsMap[record.orderItemId] || null
    if (!item) return null
    const order = ordersMap[item.orderId] || null
    if (!order) return null
    const user = users[order._openid] || null
    return normalizeVerificationRecord(record, item, order, user)
  }).filter(Boolean).filter(row => {
    if (orderIdText && row.orderId !== orderIdText) return false
    if (productType !== 'all' && row.productType !== productType) return false
    if (serviceNameText && String(row.serviceName || '').trim().toLowerCase() !== serviceNameText) return false
    if (operatorOpenidText && String(row.operatorOpenid || '').trim() !== operatorOpenidText) return false
    if (verifyCodeText && String(row.verifyCode || '').trim() !== verifyCodeText) return false
    if (keywordText) {
      const haystacks = [
        row.orderNo,
        row.userLabel,
        row.userPhone,
        row.productName,
        row.verifyCode,
        row.serviceName,
        row.operatorOpenid,
        row.remark
      ].join(' ').toLowerCase()
      if (!haystacks.includes(keywordText)) return false
    }
    const createdAt = toTimestamp(row.createdAt)
    if (startTimestamp && createdAt < startTimestamp) return false
    if (endTimestamp && createdAt > endTimestamp + 24 * 60 * 60 * 1000 - 1) return false
    return true
  }).sort((left, right) => toTimestamp(right.createdAt) - toTimestamp(left.createdAt))

  return {
    code: 0,
    data: paginate(rows, Number(page || 1), Number(pageSize || 20))
  }
}

async function verifyOrderItem(access, event) {
  const verifyCode = String((event && event.verifyCode) || '').trim()
  const serviceName = String((event && event.serviceName) || '').trim()

  if (!verifyCode) return { code: -1, msg: '缺少核销码' }

  const verification = await loadVerificationContext(access, verifyCode)
  if (verification.code) return verification

  const { item, order } = verification
  let verifiedServiceName = item.productName || '未命名商品'

  if (item.productType === 'package') {
    if (!serviceName) return { code: -1, msg: '请指定要核销的服务项目' }

    const expireAt = toTimestamp(item.packageExpireAt)
    if (expireAt && expireAt < Date.now()) {
      return { code: -1, msg: '该套餐已过期' }
    }

    const serviceExists = (Array.isArray(item.packageItems) ? item.packageItems : [])
      .some(packageItem => packageItem && packageItem.name === serviceName)
    if (!serviceExists) {
      return { code: -1, msg: '套餐内无此服务项目' }
    }

    const updateRes = await db.collection('order_items').where({
      _id: item._id,
      [`packageRemaining.${serviceName}`]: _cmd.gt(0)
    }).update({
      data: { [`packageRemaining.${serviceName}`]: _cmd.inc(-1) }
    })

    if ((updateRes.stats && updateRes.stats.updated) === 0) {
      return { code: -1, msg: `「${serviceName}」已无剩余次数` }
    }

    verifiedServiceName = serviceName
  } else {
    const remaining = item.packageRemaining || {}
    if (remaining.used) return { code: -1, msg: '该服务已核销，不可重复核销' }

    await db.collection('order_items').doc(item._id).update({
      data: {
        packageRemaining: {
          used: true,
          usedAt: db.serverDate()
        }
      }
    })
  }

  await db.collection('package_usage').add({
    data: {
      _openid: item._openid,
      orderItemId: item._id,
      serviceName: verifiedServiceName,
      operatorOpenid: access.uid,
      remark: '',
      createdAt: db.serverDate()
    }
  })

  await writeAuditLog(access, {
    action: 'orders.verifyOrderItem',
    module: 'orders',
    targetType: 'order_item',
    targetId: item._id,
    summary: `核销订单项 ${order.orderNo || item._id}`,
    detail: {
      orderId: order._id,
      orderNo: order.orderNo || '',
      orderItemId: item._id,
      verifyCode,
      productType: item.productType || '',
      serviceName: verifiedServiceName
    }
  })

  return {
    code: 0,
    msg: '核销成功',
    data: {
      serviceName: verifiedServiceName
    }
  }
}

async function listOrders(access, event) {
  const {
    status = 'all',
    page = 1,
    pageSize = 20,
    keyword = '',
    productType = 'all',
    source = 'all',
    dateRange = []
  } = event

  const storeId = getAccessStoreId(access)
  const { orders, refundMap, users, orderItemsMap } = await loadOrderContext(storeId, 500)
  const keywordText = String(keyword || '').trim().toLowerCase()
  const [startAt, endAt] = Array.isArray(dateRange) ? dateRange : []
  const startTimestamp = startAt ? toTimestamp(startAt) : 0
  const endTimestamp = endAt ? toTimestamp(endAt) : 0

  const enriched = orders.map(order => {
    const items = orderItemsMap[order._id] || []
    return normalizeOrderSummary(order, items, users[order._openid] || null, refundMap[order._id] || null)
  }).filter(order => {
    if (status !== 'all') {
      if (status === 'refund') {
        if (!['refund_requested', 'refunding', 'refunded'].includes(order.status)) return false
      } else if (order.status !== status) {
        return false
      }
    }
    if (productType !== 'all' && !order.productTypes.includes(productType)) return false
    if (source !== 'all' && order.leadSourceKey !== source) return false
    if (keywordText) {
      const haystacks = [
        order.orderNo,
        order.productName,
        order.userLabel,
        order.userPhone,
        order.itemsSummary
      ].join(' ').toLowerCase()
      if (!haystacks.includes(keywordText)) return false
    }
    const createdAt = toTimestamp(order.createdAt)
    if (startTimestamp && createdAt < startTimestamp) return false
    if (endTimestamp && createdAt > endTimestamp + 24 * 60 * 60 * 1000 - 1) return false
    return true
  })

  return { code: 0, data: paginate(enriched, Number(page || 1), Number(pageSize || 20)) }
}

async function getOrderDetail(access, event) {
  const { orderId = '' } = event
  if (!orderId) return { code: -1, msg: '缺少订单 ID' }
  const storeId = getAccessStoreId(access)
  const order = await safeGetByIdAndStore('orders', orderId, storeId)
  if (!order) return { code: -1, msg: '无权限查看该订单' }

  const [items, refundRequest, user] = await Promise.all([
    safeList('order_items', { orderId }, { orderBy: ['createdAt', 'asc'], limit: 100 }),
    safeGetFirst('refund_requests', { orderId }),
    order._openid ? safeGetFirst('users', { _openid: order._openid }) : null
  ])

  const detail = normalizeOrderSummary(order, items, user, refundRequest)
  detail.items = items.map(item => ({
    ...item,
    totalAmount: Number(item.totalAmount || item.subtotal || (item.price || 0) * (item.quantity || 1)),
    verifyCode: item.verifyCode || '',
    packageRemaining: item.packageRemaining || null,
    packageExpireAt: item.packageExpireAt || null,
    verificationStatus: getOrderItemVerificationStatus(item)
  }))
  detail.user = user ? {
    nickName: user.nickName || '',
    phone: user.phone || '',
    avatarUrl: user.avatarUrl || ''
  } : null
  const itemMap = toMap(items, '_id')
  const orderItemIds = items.map(item => item._id).filter(Boolean)
  const verificationRecords = orderItemIds.length
    ? await safeList('package_usage', {
      orderItemId: _cmd.in(orderItemIds)
    }, {
      orderBy: ['createdAt', 'desc'],
      limit: Math.max(orderItemIds.length * 10, 20)
    })
    : []
  detail.verificationRecords = verificationRecords
    .map(record => {
      const item = itemMap[record.orderItemId] || null
      if (!item) return null
      return normalizeVerificationRecord(record, item, order, user)
    })
    .filter(Boolean)
  detail.refundTimeline = refundRequest ? buildRefundTimeline(refundRequest, order) : []

  return { code: 0, data: detail }
}

async function exportOrders(access, event) {
  const listRes = await listOrders(access, { ...event, page: 1, pageSize: 500 })
  if (listRes.code) return listRes
  return {
    code: 0,
    data: (listRes.data.list || []).map(item => ({
      orderNo: item.orderNo,
      createdAt: formatDateTime(item.createdAt),
      userLabel: item.userLabel,
      phone: item.userPhone,
      productName: item.productName,
      productTypes: item.productTypes.join('、'),
      statusLabel: item.statusLabel,
      totalAmountYuan: fenToYuan(item.totalAmount),
      leadSource: item.leadSourceLabel,
      refundStatus: item.refundRequest ? item.refundRequest.statusLabel : ''
    }))
  }
}

async function reviewRefund(access, event) {
  const { requestId = '', orderId = '', status = '' } = event
  if (!requestId || !orderId || !status) return { code: -1, msg: '参数不完整' }
  if (!['approved', 'rejected'].includes(status)) return { code: -1, msg: '退款审核状态异常' }

  const storeId = getAccessStoreId(access)
  const request = await safeGetById('refund_requests', requestId)
  if (!request || request.orderId !== orderId) return { code: -1, msg: '退款申请不存在' }
  const order = await safeGetByIdAndStore('orders', orderId, storeId)
  if (!order) return { code: -1, msg: '无权限操作该门店订单' }
  if (request.status !== 'pending') return { code: -1, msg: '该申请已处理' }

  if (status === 'approved') {
    const result = await approveRefundRequest({ request, order, reviewerUid: access.uid })
    if (!result.code) {
      await writeAuditLog(access, {
        action: 'orders.reviewRefund',
        module: 'orders',
        targetType: 'refund_request',
        targetId: requestId,
        summary: `同意退款 ${order.orderNo || orderId}`,
        detail: { requestId, orderId, status: 'approved' }
      })
    }
    return result
  }

  const fallbackOrderStatus = request.previousStatus || 'paid'
  await db.runTransaction(async transaction => {
    const now = db.serverDate()
    await transaction.collection('refund_requests').doc(requestId).update({
      data: {
        status: 'rejected',
        reviewedBy: access.uid,
        reviewedAt: now,
        updatedAt: now
      }
    })
    await transaction.collection('orders').doc(orderId).update({
      data: {
        status: fallbackOrderStatus,
        updatedAt: now
      }
    })
  })

  await writeAuditLog(access, {
    action: 'orders.reviewRefund',
    module: 'orders',
    targetType: 'refund_request',
    targetId: requestId,
    summary: `驳回退款 ${order.orderNo || orderId}`,
    detail: { requestId, orderId, status: 'rejected' }
  })

  return { code: 0, msg: '退款申请已驳回' }
}

module.exports = {
  listOrders,
  getOrderDetail,
  exportOrders,
  reviewRefund,
  queryVerifyCode,
  verifyOrderItem,
  listPendingVerification,
  listVerificationRecords
}
