/**
 * 通用工具函数
 */

/**
 * 金额：分 → 元（字符串）
 * @param {number} fen 金额（分）
 * @param {number} decimals 保留小数位数，默认 2
 * @returns {string}
 */
function fenToYuan(fen, decimals = 2) {
    if (!fen && fen !== 0) return '0'
    return (fen / 100).toFixed(decimals)
}

/**
 * 金额：元 → 分（整数）
 * @param {number|string} yuan 金额（元）
 * @returns {number}
 */
function yuanToFen(yuan) {
    return Math.round(parseFloat(yuan) * 100)
}

/**
 * 格式化日期
 * @param {Date|string|number} date 
 * @param {string} fmt 格式，默认 'YYYY-MM-DD HH:mm'
 * @returns {string}
 */
function formatDate(date, fmt = 'YYYY-MM-DD HH:mm') {
    if (!date) return ''
    const d = new Date(date)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const hour = String(d.getHours()).padStart(2, '0')
    const minute = String(d.getMinutes()).padStart(2, '0')
    const second = String(d.getSeconds()).padStart(2, '0')

    return fmt
        .replace('YYYY', year)
        .replace('MM', month)
        .replace('DD', day)
        .replace('HH', hour)
        .replace('mm', minute)
        .replace('ss', second)
}

/**
 * 生成唯一订单号
 * @returns {string} 如 ORD20260317120000001
 */
function generateOrderNo() {
    const now = new Date()
    const dateStr = formatDate(now, 'YYYYMMDDHHmmss')
    const random = String(Math.floor(Math.random() * 1000)).padStart(3, '0')
    return `ORD${dateStr}${random}`
}

/**
 * 生成核销码（6 位数字）
 * @returns {string}
 */
function generateVerifyCode() {
    return String(Math.floor(100000 + Math.random() * 900000))
}

/**
 * 显示加载中
 * @param {string} title 
 */
function showLoading(title = '加载中...') {
    wx.showLoading({ title, mask: true })
}

/**
 * 隐藏加载
 */
function hideLoading() {
    wx.hideLoading()
}

/**
 * 显示轻提示
 * @param {string} title 
 * @param {string} icon 
 */
function showToast(title, icon = 'none') {
    wx.showToast({ title, icon, duration: 2000 })
}

/**
 * 显示模态弹窗
 * @param {string} title 
 * @param {string} content 
 * @returns {Promise<boolean>} 用户是否点击确认
 */
function showModal(title, content) {
    return new Promise(resolve => {
        wx.showModal({
            title,
            content,
            success: res => resolve(res.confirm)
        })
    })
}

/**
 * 获取系统信息（状态栏高度等）
 * @returns {object}
 */
function getSystemInfo() {
    try {
        const info = wx.getSystemInfoSync()
        return {
            statusBarHeight: info.statusBarHeight || 20,
            screenWidth: info.screenWidth,
            screenHeight: info.screenHeight,
            platform: info.platform
        }
    } catch (e) {
        return { statusBarHeight: 20 }
    }
}

module.exports = {
    fenToYuan,
    yuanToFen,
    formatDate,
    generateOrderNo,
    generateVerifyCode,
    showLoading,
    hideLoading,
    showToast,
    showModal,
    getSystemInfo
}
