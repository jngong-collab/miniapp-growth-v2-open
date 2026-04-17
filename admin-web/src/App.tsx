import { Suspense, lazy } from 'react'
import type { ReactNode } from 'react'
import { Spin } from 'antd'
import { createBrowserRouter } from 'react-router-dom'
import { AdminShell } from './layouts/admin-shell'
import { PermissionIndexRedirect, PermissionRoute } from './components/permission-route'

const LoginPage = lazy(() => import('./pages/login-page').then(module => ({ default: module.LoginPage })))
const DashboardPage = lazy(() => import('./pages/dashboard-page').then(module => ({ default: module.DashboardPage })))
const OrdersPage = lazy(() => import('./pages/orders-page').then(module => ({ default: module.OrdersPage })))
const VerificationPage = lazy(() => import('./pages/verification-page').then(module => ({ default: module.VerificationPage })))
const CatalogPage = lazy(() => import('./pages/catalog-page').then(module => ({ default: module.CatalogPage })))
const CampaignsPage = lazy(() => import('./pages/campaigns-page').then(module => ({ default: module.CampaignsPage })))
const FinancePage = lazy(() => import('./pages/finance-page').then(module => ({ default: module.FinancePage })))
const CustomersPage = lazy(() => import('./pages/customers-page').then(module => ({ default: module.CustomersPage })))
const OpsPage = lazy(() => import('./pages/ops-page').then(module => ({ default: module.OpsPage })))
const LeadsPage = lazy(() => import('./pages/leads-page').then(module => ({ default: module.LeadsPage })))
const SettingsPage = lazy(() => import('./pages/settings-page').then(module => ({ default: module.SettingsPage })))
const StaffPage = lazy(() => import('./pages/staff-page').then(module => ({ default: module.StaffPage })))
const NotFoundPage = lazy(() => import('./pages/not-found-page').then(module => ({ default: module.NotFoundPage })))

function withSuspense(element: ReactNode) {
  return (
    <Suspense fallback={<div className="fullscreen-center"><Spin size="large" /></div>}>
      {element}
    </Suspense>
  )
}

const router = createBrowserRouter([
  {
    path: '/login',
    element: withSuspense(<LoginPage />)
  },
  {
    path: '/',
    element: <AdminShell />,
    children: [
      { index: true, element: <PermissionIndexRedirect /> },
      {
        path: 'dashboard',
        element: withSuspense(<PermissionRoute requiredPermission="dashboard.view"><DashboardPage /></PermissionRoute>)
      },
      {
        path: 'orders',
        element: withSuspense(<PermissionRoute requiredPermission="orders.view"><OrdersPage /></PermissionRoute>)
      },
      {
        path: 'verification',
        element: withSuspense(<PermissionRoute requiredPermission="orders.view"><VerificationPage /></PermissionRoute>)
      },
      {
        path: 'catalog',
        element: withSuspense(<PermissionRoute requiredPermission="catalog.manage"><CatalogPage /></PermissionRoute>)
      },
      {
        path: 'campaigns',
        element: withSuspense(<PermissionRoute requiredPermission="campaigns.manage"><CampaignsPage /></PermissionRoute>)
      },
      {
        path: 'finance',
        element: withSuspense(<PermissionRoute requiredPermission="orders.refund.review"><FinancePage /></PermissionRoute>)
      },
      {
        path: 'leads',
        element: withSuspense(<PermissionRoute requiredPermission="crm.view"><LeadsPage /></PermissionRoute>)
      },
      {
        path: 'customers',
        element: withSuspense(<PermissionRoute requiredPermission="crm.view"><CustomersPage /></PermissionRoute>)
      },
      {
        path: 'ops',
        element: withSuspense(<PermissionRoute requiredPermission="staff.manage"><OpsPage /></PermissionRoute>)
      },
      {
        path: 'settings',
        element: withSuspense(<PermissionRoute requiredPermission="settings.manage"><SettingsPage /></PermissionRoute>)
      },
      {
        path: 'staff',
        element: withSuspense(<PermissionRoute requiredPermission="staff.manage"><StaffPage /></PermissionRoute>)
      }
    ]
  },
  {
    path: '*',
    element: withSuspense(<NotFoundPage />)
  }
])

export default router
