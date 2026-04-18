const CLOUDBASE_ENV_PLACEHOLDER = 'your-cloudbase-env-id'

function resolveCloudEnv() {
    const injectedEnv = typeof globalThis !== 'undefined' && globalThis && typeof globalThis.__CLOUDBASE_ENV_ID__ === 'string'
        ? globalThis.__CLOUDBASE_ENV_ID__.trim()
        : ''

    if (!injectedEnv || injectedEnv === CLOUDBASE_ENV_PLACEHOLDER) {
        return ''
    }
    return injectedEnv
}

/**
 * 小儿推拿门店拓客小程序 - 通用配置文件
 * 
 * ============================================================
 * 🔧 部署新门店时，只需要修改此文件即可
 * ============================================================
 * 
 * 以下配置项需要在新门店部署时修改：
 * 1. cloudEnv    - 微信云开发环境 ID
 * 2. version     - 版本号（可选）
 * 
 * 其他运行时配置（门店名称、Logo、AI 配置等）在管理后台配置
 * 存储在云数据库中，不需要改代码
 */

module.exports = {
    // ============================================================
    // 📌 核心配置（部署新门店时必须修改）
    // ============================================================

    /** 
     * 微信云开发环境 ID
     * 在微信开发者工具中创建云开发环境后获取
     * 格式一般为：xxx-yyy 或 cloud1-xxxxxxxx
     */
    // 仓库中只保留占位逻辑；真实环境 ID 通过本地未跟踪补丁或构建注入。
    cloudEnv: resolveCloudEnv(),
    cloudEnvPlaceholder: CLOUDBASE_ENV_PLACEHOLDER,

    // ============================================================
    // 📱 应用配置
    // ============================================================

    /** 应用版本号 */
    version: '1.0.0',

    /** 主题色 */
    themeColor: '#FF5A5F',

    // ============================================================
    // 💰 业务默认值
    // ============================================================

    /** 订单未支付超时时间（分钟） */
    orderExpireMinutes: 30,

    /** 余额是否可以提现（false = 只能用于购买商品） */
    balanceWithdrawable: false,

    /** 裂变返现到账方式：'balance' = 到余额 */
    cashbackMethod: 'balance',

    // ============================================================
    // 🔮 AI 舌象默认配置（实际配置在管理后台云数据库中）
    // ============================================================

    /** AI 分析请求超时时间（毫秒） */
    aiTimeout: 30000,

    /** 舌象照片最大尺寸（KB），超过则压缩 */
    tongueImageMaxSize: 500,

    /** 舌象照片压缩后宽度（px） */
    tongueImageWidth: 800,

    // ============================================================
    // 📦 商品配置
    // ============================================================

    /** 每页加载商品数量 */
    productsPerPage: 20,

    /** 订单列表每页数量 */
    ordersPerPage: 10,

    // ============================================================
    // 🛡️ 安全配置
    // ============================================================

    /** 
     * 邀请关系绑定规则
     * 'first' = 首次点击的邀请链接为准
     * 'last'  = 最后点击的邀请链接为准
     */
    inviteBindRule: 'first',

    /**
     * 同一用户裂变活动默认限购数量
     * （可在每个活动中单独覆盖）
     */
    defaultLimitPerUser: 1,

    // ============================================================
    // 🔗 分享配置
    // ============================================================

    /** 默认分享标题（运行时会根据审核模式覆盖） */
    shareTitle: '记录宝宝健康每一天',

    /** 默认分享图片路径（小程序内相对路径或云存储 URL） */
    shareImageUrl: '',

    /** 正常模式分享标题 */
    normalShareTitle: '🔮 AI 看舌象，免费测体质！',

    /** 审核模式安全兜底配置 */
    reviewModeFallback: {
        enabled: true,
        entryTitle: '宝宝日常',
        pageTitle: '宝宝日常',
        historyTitle: '成长记录',
        reportTitle: '记录详情',
        submitText: '保存本次记录',
        shareTitle: '记录宝宝健康每一天',
        emptyText: '暂无成长记录',
        listTagText: '待AI分析',
        detailCtaText: '消耗 1 积分，立即生成 AI 体质报告',
        historyLinkText: '查看成长记录',
        historyEmptyText: '暂无成长记录',
        guideTitle: '拍照小贴士',
        guideTips: ['光线明亮自然', '面部和舌面保持清晰', '避免滤镜和美颜'],
        previewPrimaryText: '保存本次记录',
        analyzingTitle: '正在保存照片记录',
        analyzingSubtitle: '请稍候，正在整理本次拍摄内容…',
        safeBannerUrl: '/assets/images/baby-massage.png',
        safeShareImageUrl: '/assets/images/baby-massage.png',
        hideHistoryAiRecords: true,
        allowReanalyzeAfterReview: true
    },

    /** 裂变商品分享标题模板（{price} 和 {cashback} 会被替换） */
    fissionShareTitle: '🔥 仅需¥{price}，分享给好友还能赚¥{cashback}！',
}
