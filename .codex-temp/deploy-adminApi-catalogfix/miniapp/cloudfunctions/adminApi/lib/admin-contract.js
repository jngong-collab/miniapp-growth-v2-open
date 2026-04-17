const ADMIN_PERMISSION_KEYS = [
  'dashboard.view',
  'orders.view',
  'orders.refund.review',
  'catalog.manage',
  'campaigns.manage',
  'crm.view',
  'settings.manage',
  'staff.manage',
  'audit.view'
]

const ADMIN_ROUTE_PERMISSIONS = {
  '/dashboard': 'dashboard.view',
  '/orders': 'orders.view',
  '/verification': 'orders.view',
  '/catalog': 'catalog.manage',
  '/campaigns': 'campaigns.manage',
  '/leads': 'crm.view',
  '/customers': 'crm.view',
  '/finance': 'orders.refund.review',
  '/settings': 'settings.manage',
  '/ops': 'staff.manage',
  '/staff': 'staff.manage'
}

module.exports = {
  ADMIN_PERMISSION_KEYS,
  ADMIN_ROUTE_PERMISSIONS
}
