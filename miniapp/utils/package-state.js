function buildRemainingItems(packageItems, remaining) {
    if (!Array.isArray(packageItems) || packageItems.length === 0) return null

    return packageItems.map(item => {
        const total = item.count || 0
        const left = remaining[item.name] ?? total
        return {
            name: item.name,
            total,
            remaining: left,
            used: total - left
        }
    })
}

function enrichPackageItemState(item) {
    const remaining = item.packageRemaining || {}
    let isUsed = false
    let remainingItems = null

    if (item.productType === 'service') {
        isUsed = remaining.used === true
    } else if (item.productType === 'package') {
        remainingItems = buildRemainingItems(item.packageItems, remaining)
        isUsed = Array.isArray(remainingItems) && remainingItems.length > 0
            ? remainingItems.every(entry => entry.remaining <= 0)
            : false
    }

    return {
        ...item,
        isUsed,
        remainingItems
    }
}

function countActivePackageItems(items = []) {
    return items
        .map(enrichPackageItemState)
        .filter(item => !item.isUsed)
        .length
}

module.exports = {
    enrichPackageItemState,
    countActivePackageItems
}
