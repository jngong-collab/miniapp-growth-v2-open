export type PermissionKey =
  | 'dashboard.view'
  | 'orders.view'
  | 'orders.refund.review'
  | 'catalog.manage'
  | 'campaigns.manage'
  | 'crm.view'
  | 'crm.manage'
  | 'settings.manage'
  | 'staff.manage'
  | 'audit.view'

export interface AdminSession {
  uid: string
  username: string
  displayName: string
  role: string
  status: string
  permissions: PermissionKey[]
  storeId: string
  storeName: string
  storeInfo: Record<string, unknown> | null
  routePermissions: Record<string, PermissionKey>
}

export interface PagedResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

export interface DashboardMetrics {
  gmvToday: number
  gmv7d: number
  gmv30d: number
  paidOrderToday: number
  paidOrder7d: number
  refundPending: number
  refundingCount: number
  pendingVerifyCount: number
  fissionPaid7: number
  leadEvents7: number
  conversionRate7: number
  customerCount: number
  followupPending: number
}

export interface DashboardOverview {
  metrics: DashboardMetrics
  hotProducts: Array<{
    productId: string
    productName: string
    revenue: number
    quantity: number
  }>
  hotCampaigns: Array<{
    _id: string
    name: string
    status: string
    soldCount: number
    totalCashback: number
    newCustomers: number
  }>
}

export interface TrendPoint {
  label: string
  orders: number
  gmv: number
  leads: number
  refunds: number
}

export interface GeocodeResult {
  latitude: number
  longitude: number
  formattedAddress: string
  provider: string
}

export interface OrderSummary {
  _id: string
  orderNo: string
  createdAt: unknown
  createdAtText: string
  status: string
  statusLabel: string
  productName: string
  productTypes: string[]
  itemsSummary: string
  totalAmount: number
  totalAmountYuan: string
  userLabel: string
  userPhone: string
  leadSourceKey: string
  leadSourceLabel: string
  refundRequest?: {
    _id: string
    status: string
    statusLabel: string
  } | null
}

export interface OrderItemDetail {
  _id?: string
  productId?: string
  productName: string
  productType: string
  quantity: number
  price: number
  totalAmount: number
  verifyCode?: string
  packageItems?: Array<{ name: string; count: number }> | null
  packageRemaining?: Record<string, unknown> | null
  packageExpireAt?: unknown | null
  verificationStatus?: string
}

export interface OrderDetail extends OrderSummary {
  items: OrderItemDetail[]
  user: {
    nickName: string
    phone: string
    avatarUrl: string
  } | null
  refundTimeline: Array<{
    label: string
    at: unknown
    note: string
  }>
  verificationRecords?: VerificationRecord[]
}

export interface VerificationLookup {
  orderId: string
  orderNo: string
  orderStatus: string
  productName: string
  productType: string
  verifyCode: string
  packageItems: Array<{ name: string; count: number }>
  packageRemaining: Record<string, unknown> | null
  packageExpireAt: unknown | null
  expiry: unknown | null
  verificationStatus: string
}

export interface VerificationPackageItem {
  name: string
  count: number
}

export interface VerificationUsageRecord {
  serviceName: string
  orderItemId?: string
  operatorOpenid?: string
  remark?: string
  createdAt?: unknown
}

export interface VerificationQueueFilters {
  [key: string]: unknown
  page?: number
  pageSize?: number
  keyword?: string
  status?: string
  productType?: string
  dateRange?: string[]
}

export interface VerificationQueueItem {
  orderId: string
  orderNo: string
  storeId: string
  orderStatus: string
  orderStatusLabel: string
  userLabel: string
  userPhone: string
  productId: string
  productName: string
  productType: string
  verifyCode: string
  packageItems: VerificationPackageItem[]
  packageRemaining: Record<string, unknown> | null
  packageExpireAt: unknown | null
  verificationStatus: string
  verificationStatusLabel: string
  pendingSummary: string
  createdAt: unknown
  createdAtText: string
  canVerify: boolean
}

export interface VerificationRecordFilters {
  [key: string]: unknown
  page?: number
  pageSize?: number
  keyword?: string
  orderId?: string
  productType?: string
  serviceName?: string
  operatorOpenid?: string
  verifyCode?: string
  dateRange?: string[]
}

export interface VerificationRecordItem {
  usageId: string
  orderItemId: string
  orderId: string
  orderNo: string
  orderStatus: string
  orderStatusLabel: string
  userLabel: string
  userPhone: string
  productName: string
  productType: string
  verifyCode: string
  serviceName: string
  operatorOpenid: string
  remark: string
  verificationStatus: string
  verificationStatusLabel: string
  createdAt: unknown
  createdAtText: string
}

export type VerificationRecord = VerificationRecordItem

export interface ProductRecord {
  _id: string
  name: string
  type: string
  category: string
  price: number
  originalPrice: number
  priceYuan: string
  originalPriceYuan: string
  stock: number
  soldCount: number
  status: string
  statusLabel: string
  showInMall: boolean
  sortOrder: number
  deliveryType: string
  description: string
  detail: string
  efficacy: string
  tags: string[]
  images: string[]
}

export interface PackageRecord {
  _id: string
  productId: string
  name: string
  productName: string
  type: string
  category: string
  price: number
  originalPrice: number
  priceYuan: string
  originalPriceYuan: string
  stock: number
  stockLabel: string | number
  soldCount: number
  status: string
  statusLabel: string
  showInMall: boolean
  sortOrder: number
  deliveryType: string
  description: string
  detail: string
  efficacy: string
  tags: string[]
  images: string[]
  validDays: number
  items: Array<{ name: string; count: number }>
  itemsText: string
}

export interface GenericCampaign {
  [key: string]: unknown
  _id: string
  status: string
}

export interface CampaignListResult {
  fissionCampaigns: GenericCampaign[]
  lotteryCampaigns: GenericCampaign[]
}

export interface LeadRecord {
  _openid: string
  nickName: string
  avatarUrl: string
  phone: string
  primarySourceLabel: string
  tracksLabel: string[]
  lastActivityAt: unknown
  followupStatus: string
  followupStatusLabel: string
  followupNote: string
}

export interface SettingsData {
  storeInfo: Record<string, unknown> | null
  aiConfig: AiConfig | null
  payConfig: PayConfig | null
  adminAccounts: AdminAccount[]
  notificationConfig: NotificationConfig | null
}

export interface ReviewConfig {
  enabled: boolean
  entryTitle: string
  pageTitle: string
  historyTitle: string
  reportTitle: string
  submitText: string
  shareTitle: string
  emptyText: string
  listTagText: string
  safeBannerUrl: string
  safeShareImageUrl: string
  hideHistoryAiRecords: boolean
  allowReanalyzeAfterReview: boolean
}

export interface AiConfig {
  _id?: string
  enabled: boolean
  apiUrl: string
  apiKey: string
  model: string
  imageApiUrl: string
  imageApiKey: string
  imageModel: string
  dailyLimit: number
  userDailyLimit: number
  systemPrompt: string
  reviewConfig: ReviewConfig
}

export interface AiModelListResult {
  models: string[]
  selectedModel: string
  requestUrl: string
}

export interface AiConnectionTestResult {
  models: string[]
  selectedModel: string
  requestUrl: string
}

export interface StaffRecord {
  openid: string
  name: string
  phone: string
  permissions: string[]
  permissionsText: string
}

export interface AdminAccount {
  _id?: string
  uid: string
  username: string
  displayName: string
  role: string
  status: AdminAccountStatus
  permissions: PermissionKey[]
  lastLoginAt?: unknown
}

export type AdminAccountStatus = 'active' | 'disabled' | 'pending_activation'

export interface AdminRoleTemplate {
  _id?: string
  roleKey: string
  roleName: string
  permissions: PermissionKey[]
  isSystem?: boolean
  status?: string
}

export interface AdminAccountForm {
  uid?: string
  username: string
  displayName: string
  role: string
  permissions: PermissionKey[]
  storeId?: string
  status?: AdminAccountStatus
}

export interface AdminLoginEvent {
  _id?: string
  uid: string
  username: string
  eventType: string
  result: string
  ip?: string
  createdAt: unknown
}

export interface AuditLogRecord {
  _id?: string
  actorName: string
  action: string
  module: string
  summary: string
  createdAt: unknown
}

export interface PaymentRecord {
  orderId: string
  orderNo: string
  userLabel: string
  userPhone: string
  payAmount: number
  payAmountYuan: string
  balanceUsed: number
  balanceUsedYuan: string
  paymentId: string
  status: string
  paidAt: unknown
  createdAt: unknown
}

export interface RefundRecord {
  requestId: string
  orderId: string
  orderNo: string
  userLabel: string
  userPhone: string
  refundAmount: number
  refundAmountYuan: string
  status: string
  reason: string
  reviewedAt: unknown | null
  refundProcessedAt: unknown | null
  outRefundNo: string
  createdAt: unknown
}

export interface ReconciliationSummary {
  gmv: number
  gmvYuan: string
  netRevenue: number
  netRevenueYuan: string
  refundTotal: number
  refundTotalYuan: string
  orderCount: number
  refundCount: number
  daily: Array<{
    day: string
    gmv: number
    refund: number
    orderCount: number
  }>
}

export interface CustomerRecord {
  _openid: string
  nickName: string
  avatarUrl: string
  phone: string
  phoneBound: boolean
  phoneBoundAt: unknown
  profileCompleted: boolean
  balance: number
  balanceYuan: string
  totalEarned: number
  totalEarnedYuan: string
  totalInvited: number
  memberLevel: string
  memberLevelLabel: string
  memberNote: string
  memberTagsText: string
  memberTags: string[]
  memberOwnerStaffOpenid: string
  memberOwnerStaffName: string
  loginStatus: string
  loginStatusLabel: string
  isLoggedIn: boolean
  lastLoginAt: unknown
  tongueCount: number
  lastTongueAt: unknown
  invitedBy: string
  followupStatus: string
  followupStatusLabel: string
  followupLastAt: unknown
  followupLastNote: string
  createdAt: unknown
}

export interface CustomerTongueReport {
  _id: string
  createdAt: unknown
  isReviewMode: boolean
  conclusion: string
  analysisDetails: string
}

export interface FollowupEvent {
  status: string
  statusLabel: string
  note: string
  operatorName: string
  updatedAt: unknown
}

export interface CustomerDetail extends CustomerRecord {
  recentOrders: OrderSummary[]
  followupEvents: FollowupEvent[]
  recentTongueReports: CustomerTongueReport[]
}

export interface CustomerUpdatePayload {
  openid: string
  memberLevel?: string
  memberNote?: string
  memberTags?: string[] | string
  memberOwnerStaffOpenid?: string
  memberOwnerStaffName?: string
}

export interface ProductDetail extends ProductRecord {
  packages: PackageRecord[]
}

export interface CampaignDetail extends GenericCampaign {
  entryCount?: number
  winCount?: number
  soldCount?: number
  newCustomers?: number
  totalCashback?: number
}

export interface FissionRecord {
  _id?: string
  inviterOpenid: string
  inviteeOpenid: string
  orderId: string
  cashbackAmount: number
  cashbackAmountYuan: string
  status: string
  createdAt: unknown
}

export interface PayConfig {
  _id?: string
  enabled: boolean
  mchId: string
  notifyUrl: string
  apiV3Key: string
  certSerialNo: string
  privateKey: string
  privateKeyFileName: string
  certificatePem: string
  certificateFileName: string
  apiV3KeyConfigured: boolean
  privateKeyConfigured: boolean
  certificateConfigured: boolean
}

export interface NotificationConfig {
  _id?: string
  orderNotifyEnabled: boolean
  refundNotifyEnabled: boolean
  followupNotifyEnabled: boolean
  notifyChannels: string[]
  adminPhones: string[]
}

export interface SystemHealth {
  adminApi: 'ok' | 'degraded' | 'unknown'
  database: 'ok' | 'degraded' | 'unknown'
  storage: 'ok' | 'degraded' | 'unknown'
  timestamp: unknown
}
