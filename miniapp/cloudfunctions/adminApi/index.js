const { requireAdminAccess } = require('./lib/context')
const authModule = require('./lib/modules-auth')
const dashboardModule = require('./lib/modules-dashboard')
const ordersModule = require('./lib/modules-orders')
const catalogModule = require('./lib/modules-catalog')
const campaignsModule = require('./lib/modules-campaigns')
const leadsModule = require('./lib/modules-leads')
const settingsModule = require('./lib/modules-settings')
const staffModule = require('./lib/modules-staff')
const financeModule = require('./lib/modules-finance')

exports.main = async (event = {}) => {
  const action = event.action || ''

  switch (action) {
    case 'auth.me':
      return authModule.getAdminMe()
    case 'dashboard.getOverview':
      return withAdmin('viewDashboard', access => dashboardModule.getOverview(access))
    case 'dashboard.getTrends':
      return withAdmin('viewDashboard', access => dashboardModule.getTrends(access, event))
    case 'orders.list':
      return withAdmin('viewOrders', access => ordersModule.listOrders(access, event))
    case 'orders.getDetail':
      return withAdmin('viewOrders', access => ordersModule.getOrderDetail(access, event))
    case 'orders.export':
      return withAdmin('viewOrders', access => ordersModule.exportOrders(access, event))
    case 'orders.queryVerifyCode':
      return withAdmin('viewOrders', access => ordersModule.queryVerifyCode(access, event))
    case 'orders.verifyOrderItem':
      return withAdmin('viewOrders', access => ordersModule.verifyOrderItem(access, event))
    case 'orders.listPendingVerification':
      return withAdmin('viewOrders', access => ordersModule.listPendingVerification(access, event))
    case 'orders.listVerificationRecords':
      return withAdmin('viewOrders', access => ordersModule.listVerificationRecords(access, event))
    case 'orders.reviewRefund':
      return withAdmin('manageRefunds', access => ordersModule.reviewRefund(access, event))
    case 'catalog.listProducts':
      return withAdmin('manageProducts', access => catalogModule.listProducts(access))
    case 'catalog.listPackages':
      return withAdmin('manageProducts', access => catalogModule.listPackages(access))
    case 'catalog.saveProduct':
      return withAdmin('manageProducts', access => catalogModule.saveProduct(access, event))
    case 'catalog.toggleProductStatus':
      return withAdmin('manageProducts', access => catalogModule.toggleProductStatus(access, event))
    case 'catalog.savePackage':
      return withAdmin('manageProducts', access => catalogModule.savePackage(access, event))
    case 'catalog.getProductDetail':
      return withAdmin('manageProducts', access => catalogModule.getProductDetail(access, event))
    case 'campaigns.list':
      return withAdmin('manageCampaigns', access => campaignsModule.listCampaigns(access))
    case 'campaigns.saveFission':
      return withAdmin('manageCampaigns', access => campaignsModule.saveFission(access, event))
    case 'campaigns.saveLottery':
      return withAdmin('manageCampaigns', access => campaignsModule.saveLottery(access, event))
    case 'campaigns.toggleStatus':
      return withAdmin('manageCampaigns', access => campaignsModule.toggleStatus(access, event))
    case 'campaigns.getFissionDetail':
      return withAdmin('manageCampaigns', access => campaignsModule.getFissionDetail(access, event))
    case 'campaigns.listFissionRecords':
      return withAdmin('manageCampaigns', access => campaignsModule.listFissionRecords(access, event))
    case 'leads.list':
      return withAdmin('viewLeads', access => leadsModule.listLeads(access, event))
    case 'leads.saveFollowup':
      return withAdmin('viewLeads', access => leadsModule.saveFollowup(access, event))
    case 'leads.export':
      return withAdmin('viewLeads', access => leadsModule.exportLeads(access, event))
    case 'leads.listCustomers':
      return withAdmin('viewLeads', access => leadsModule.listCustomers(access, event))
    case 'leads.getCustomerDetail':
      return withAdmin('viewLeads', access => leadsModule.getCustomerDetail(access, event))
    case 'leads.listFollowupEvents':
      return withAdmin('viewLeads', access => leadsModule.listFollowupEvents(access, event))
    case 'settings.get':
      return withAdmin('manageSettings', access => settingsModule.getSettings(access))
    case 'settings.updateStore':
      return withAdmin('manageSettings', access => settingsModule.updateStore(access, event))
    case 'settings.updatePayConfig':
      return withAdmin('manageSettings', access => settingsModule.updatePayConfig(access, event))
    case 'settings.updateAiConfig':
      return withAdmin('manageSettings', access => settingsModule.updateAiConfig(access, event))
    case 'settings.fetchAiModels':
      return withAdmin('manageSettings', access => settingsModule.fetchAiModels(access, event))
    case 'settings.testAiConfig':
      return withAdmin('manageSettings', access => settingsModule.testAiConfig(access, event))
    case 'settings.updateNotificationConfig':
      return withAdmin('manageSettings', access => settingsModule.updateNotificationConfig(access, event))
    case 'settings.geocodeAddress':
      return withAdmin('manageSettings', access => settingsModule.geocodeAddress(access, event))
    case 'settings.getSystemHealth':
      return withAdmin('manageSettings', access => settingsModule.getSystemHealth(access))
    case 'staff.list':
      return withAdmin('manageStaff', access => staffModule.listMiniappStaff(access))
    case 'staff.updateMiniappStaffPermissions':
      return withAdmin('manageStaff', access => staffModule.updateMiniappStaffPermissions(access, event))
    case 'staff.listAdminAccounts':
      return withAdmin('manageStaff', access => staffModule.listAdminAccounts(access))
    case 'staff.listRoleTemplates':
      return withAdmin('manageStaff', access => staffModule.listRoleTemplates(access))
    case 'staff.createAdminAccount':
      return withAdmin('manageStaff', access => staffModule.createAdminAccount(access, event))
    case 'staff.updateAdminAccountStatus':
      return withAdmin('manageStaff', access => staffModule.updateAdminAccountStatus(access, event))
    case 'staff.updateAdminAccountPermissions':
      return withAdmin('manageStaff', access => staffModule.updateAdminAccountPermissions(access, event))
    case 'staff.listAdminLoginEvents':
      return withAdmin('manageStaff', access => staffModule.listAdminLoginEvents(access, event))
    case 'audit.list':
      return withAdmin('viewAuditLogs', access => staffModule.listAuditLogs(access, event))
    case 'finance.listPaymentRecords':
      return withAdmin('manageRefunds', access => financeModule.listPaymentRecords(access, event))
    case 'finance.listRefundRecords':
      return withAdmin('manageRefunds', access => financeModule.listRefundRecords(access, event))
    case 'finance.getReconciliationSummary':
      return withAdmin('manageRefunds', access => financeModule.getReconciliationSummary(access, event))
    default:
      return { code: -1, msg: '未知操作' }
  }
}

async function withAdmin(permission, handler) {
  const access = await requireAdminAccess(permission)
  if (access.code) return access
  try {
    return await handler(access)
  } catch (error) {
    console.error('adminApi handler failed:', permission, error)
    return { code: -1, msg: error.message || '后台操作失败' }
  }
}
