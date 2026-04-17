import { callFunction } from './cloudbase'
import type {
  AdminAccount,
  AdminAccountForm,
  AdminLoginEvent,
  AdminAccountStatus,
  AdminRoleTemplate,
  AuditLogRecord,
  AdminSession,
  CampaignListResult,
  CampaignDetail,
  CustomerDetail,
  CustomerRecord,
  DashboardOverview,
  AiConfig,
  AiConnectionTestResult,
  AiModelListResult,
  GeocodeResult,
  FissionRecord,
  FollowupEvent,
  LeadRecord,
  NotificationConfig,
  OrderDetail,
  OrderSummary,
  PackageRecord,
  PagedResult,
  PaymentRecord,
  ProductDetail,
  ProductRecord,
  RefundRecord,
  ReconciliationSummary,
  SettingsData,
  StaffRecord,
  SystemHealth,
  TrendPoint,
  VerificationLookup,
  VerificationQueueItem,
  VerificationRecord,
  VerificationUsageRecord
} from '../types/admin'

interface CloudFunctionResult<T> {
  result?: {
    code: number
    msg?: string
    data: T
  }
}

async function callAdminApi<T>(action: string, payload: Record<string, unknown> = {}) {
  const response = await callFunction<CloudFunctionResult<T>>('adminApi', { action, ...payload })
  const result = response.result
  if (!result) {
    throw new Error('后台接口返回为空')
  }
  if (result.code !== 0) {
    throw new Error(result.msg || '后台接口调用失败')
  }
  return result.data
}

export const adminApi = {
  me: () => callAdminApi<AdminSession>('auth.me'),
  getDashboardOverview: () => callAdminApi<DashboardOverview>('dashboard.getOverview'),
  getDashboardTrends: (range: '7d' | '30d') => callAdminApi<TrendPoint[]>('dashboard.getTrends', { range }),
  listOrders: (filters: Record<string, unknown>) => callAdminApi<PagedResult<OrderSummary>>('orders.list', filters),
  getOrderDetail: (orderId: string) => callAdminApi<OrderDetail>('orders.getDetail', { orderId }),
  listPendingVerification: (filters: Record<string, unknown>) =>
    callAdminApi<PagedResult<VerificationQueueItem>>('orders.listPendingVerification', filters),
  listVerificationRecords: (filters: Record<string, unknown>) =>
    callAdminApi<PagedResult<VerificationRecord>>('orders.listVerificationRecords', filters),
  queryVerifyCode: (verifyCode: string) => callAdminApi<VerificationLookup>('orders.queryVerifyCode', { verifyCode }),
  verifyOrderItem: (verifyCode: string, serviceName?: string) =>
    callAdminApi<VerificationUsageRecord>('orders.verifyOrderItem', { verifyCode, serviceName }),
  exportOrders: (filters: Record<string, unknown>) => callAdminApi<Record<string, string>[]>('orders.export', filters),
  reviewRefund: (requestId: string, orderId: string, status: 'approved' | 'rejected') =>
    callAdminApi<unknown>('orders.reviewRefund', { requestId, orderId, status }),
  listProducts: () => callAdminApi<ProductRecord[]>('catalog.listProducts'),
  listPackages: () => callAdminApi<PackageRecord[]>('catalog.listPackages'),
  saveProduct: (payload: Record<string, unknown>) => callAdminApi<ProductRecord>('catalog.saveProduct', { payload }),
  toggleProductStatus: (productId: string, status: 'on' | 'off') =>
    callAdminApi<ProductRecord>('catalog.toggleProductStatus', { productId, status }),
  savePackage: (payload: Record<string, unknown>) => callAdminApi<PackageRecord>('catalog.savePackage', { payload }),
  deletePackage: (packageId: string, productId: string) =>
    callAdminApi<{ productId: string; removedPackageCount: number }>('catalog.deletePackage', { packageId, productId }),
  listCampaigns: () => callAdminApi<CampaignListResult>('campaigns.list'),
  saveFission: (payload: Record<string, unknown>) => callAdminApi<Record<string, unknown>>('campaigns.saveFission', { payload }),
  saveLottery: (payload: Record<string, unknown>) => callAdminApi<Record<string, unknown>>('campaigns.saveLottery', { payload }),
  toggleCampaignStatus: (campaignType: 'fission' | 'lottery', campaignId: string, status: string) =>
    callAdminApi<Record<string, unknown>>('campaigns.toggleStatus', { campaignType, campaignId, status }),
  listLeads: (filters: Record<string, unknown>) => callAdminApi<PagedResult<LeadRecord>>('leads.list', filters),
  saveFollowup: (leadOpenid: string, status: string, note: string) =>
    callAdminApi<unknown>('leads.saveFollowup', { leadOpenid, status, note }),
  exportLeads: (filters: Record<string, unknown>) => callAdminApi<Record<string, string>[]>('leads.export', filters),
  getSettings: () => callAdminApi<SettingsData>('settings.get'),
  updateStore: (payload: Record<string, unknown>) => callAdminApi<Record<string, unknown>>('settings.updateStore', { payload }),
  geocodeAddress: (address: string) => callAdminApi<GeocodeResult>('settings.geocodeAddress', { address }),
  updatePayConfig: (payload: Record<string, unknown>) => callAdminApi<Record<string, unknown>>('settings.updatePayConfig', { payload }),
  updateAiConfig: (payload: Record<string, unknown>) => callAdminApi<AiConfig>('settings.updateAiConfig', { payload }),
  fetchAiModels: (payload: Record<string, unknown>) => callAdminApi<AiModelListResult>('settings.fetchAiModels', { payload }),
  testAiConfig: (payload: Record<string, unknown>) => callAdminApi<AiConnectionTestResult>('settings.testAiConfig', { payload }),
  listStaff: () => callAdminApi<StaffRecord[]>('staff.list'),
  updateMiniappStaffPermissions: (staffOpenid: string, permissions: string[]) =>
    callAdminApi<StaffRecord>('staff.updateMiniappStaffPermissions', { staffOpenid, permissions }),
  listRoleTemplates: () => callAdminApi<AdminRoleTemplate[]>('staff.listRoleTemplates'),
  listAdminAccounts: () => callAdminApi<AdminAccount[]>('staff.listAdminAccounts'),
  createAdminAccount: (payload: AdminAccountForm) =>
    callAdminApi<AdminAccount>('staff.createAdminAccount', { payload }),
  updateAdminAccountStatus: (uid: string, status: AdminAccountStatus) =>
    callAdminApi<AdminAccount>('staff.updateAdminAccountStatus', { uid, status }),
  updateAdminAccountPermissions: (uid: string, permissions: AdminAccount['permissions'], role?: string) =>
    callAdminApi<AdminAccount>('staff.updateAdminAccountPermissions', { uid, permissions, role }),
  listAdminLoginEvents: (page = 1, pageSize = 30) =>
    callAdminApi<PagedResult<AdminLoginEvent>>('staff.listAdminLoginEvents', { page, pageSize }),
  listAuditLogs: (page = 1, pageSize = 30) => callAdminApi<PagedResult<AuditLogRecord>>('audit.list', { page, pageSize }),
  listPaymentRecords: (filters: Record<string, unknown>) =>
    callAdminApi<PagedResult<PaymentRecord>>('finance.listPaymentRecords', filters),
  listRefundRecords: (filters: Record<string, unknown>) =>
    callAdminApi<PagedResult<RefundRecord>>('finance.listRefundRecords', filters),
  getReconciliationSummary: (dateRange?: string[]) =>
    callAdminApi<ReconciliationSummary>('finance.getReconciliationSummary', { dateRange }),
  listCustomers: (filters: Record<string, unknown>) =>
    callAdminApi<PagedResult<CustomerRecord>>('leads.listCustomers', filters),
  getCustomerDetail: (openid: string) =>
    callAdminApi<CustomerDetail>('leads.getCustomerDetail', { openid }),
  listFollowupEvents: (openid: string) =>
    callAdminApi<FollowupEvent[]>('leads.listFollowupEvents', { openid }),
  getProductDetail: (productId: string) =>
    callAdminApi<ProductDetail>('catalog.getProductDetail', { productId }),
  getFissionDetail: (campaignId: string) =>
    callAdminApi<CampaignDetail>('campaigns.getFissionDetail', { campaignId }),
  listFissionRecords: (campaignId: string, page = 1, pageSize = 20) =>
    callAdminApi<PagedResult<FissionRecord>>('campaigns.listFissionRecords', { campaignId, page, pageSize }),
  updateNotificationConfig: (payload: Record<string, unknown>) =>
    callAdminApi<NotificationConfig>('settings.updateNotificationConfig', { payload }),
  generateImage: (prompt: string) =>
    callAdminApi<{ url: string }>('settings.generateImage', { prompt }),
  getSystemHealth: () => callAdminApi<SystemHealth>('settings.getSystemHealth')
}
