import { createBrowserRouter } from 'react-router-dom'
import { AdminShell } from './layouts/admin-shell'
import { LoginPage } from './pages/login-page'
import { DashboardPage } from './pages/dashboard-page'
import { OrdersPage } from './pages/orders-page'
import { VerificationPage } from './pages/verification-page'
import { CatalogPage } from './pages/catalog-page'
import { CampaignsPage } from './pages/campaigns-page'
import { FinancePage } from './pages/finance-page'
import { CustomersPage } from './pages/customers-page'
import { OpsPage } from './pages/ops-page'
import { LeadsPage } from './pages/leads-page'
import { SettingsPage } from './pages/settings-page'
import { StaffPage } from './pages/staff-page'
import { NotFoundPage } from './pages/not-found-page'
import { PermissionIndexRedirect, PermissionRoute } from './components/permission-route'

const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />
  },
  {
    path: '/',
    element: <AdminShell />,
    children: [
      { index: true, element: <PermissionIndexRedirect /> },
      {
        path: 'dashboard',
        element: <PermissionRoute requiredPermission="dashboard.view"><DashboardPage /></PermissionRoute>
      },
      {
        path: 'orders',
        element: <PermissionRoute requiredPermission="orders.view"><OrdersPage /></PermissionRoute>
      },
      {
        path: 'verification',
        element: <PermissionRoute requiredPermission="orders.view"><VerificationPage /></PermissionRoute>
      },
      {
        path: 'catalog',
        element: <PermissionRoute requiredPermission="catalog.manage"><CatalogPage /></PermissionRoute>
      },
      {
        path: 'campaigns',
        element: <PermissionRoute requiredPermission="campaigns.manage"><CampaignsPage /></PermissionRoute>
      },
      {
        path: 'finance',
        element: <PermissionRoute requiredPermission="orders.refund.review"><FinancePage /></PermissionRoute>
      },
      {
        path: 'leads',
        element: <PermissionRoute requiredPermission="crm.view"><LeadsPage /></PermissionRoute>
      },
      {
        path: 'customers',
        element: <PermissionRoute requiredPermission="crm.view"><CustomersPage /></PermissionRoute>
      },
      {
        path: 'ops',
        element: <PermissionRoute requiredPermission="staff.manage"><OpsPage /></PermissionRoute>
      },
      {
        path: 'settings',
        element: <PermissionRoute requiredPermission="settings.manage"><SettingsPage /></PermissionRoute>
      },
      {
        path: 'staff',
        element: <PermissionRoute requiredPermission="staff.manage"><StaffPage /></PermissionRoute>
      }
    ]
  },
  {
    path: '*',
    element: <NotFoundPage />
  }
])

export default router
