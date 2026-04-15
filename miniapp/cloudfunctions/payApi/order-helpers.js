function summarizeCartOrderItems(items) {
    const normalizedItems = Array.isArray(items) ? items.filter(Boolean) : []
    const itemCount = normalizedItems.length
    const totalQuantity = normalizedItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
    const totalAmount = normalizedItems.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0)
    const firstName = normalizedItems[0] ? normalizedItems[0].productName : '商城商品'

    return {
        totalAmount,
        totalQuantity,
        itemCount,
        productName: itemCount > 1 ? `${firstName}等${itemCount}件商品` : firstName
    }
}

function buildOrderDisplayName(order) {
    if (order && order.productName) {
        return order.productName
    }
    const items = order && Array.isArray(order.items) ? order.items : []
    return items[0] ? items[0].productName : '门店订单'
}

module.exports = {
    summarizeCartOrderItems,
    buildOrderDisplayName
}
