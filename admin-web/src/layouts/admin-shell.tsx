import type { ReactNode } from 'react'
import { useEffect, useMemo } from 'react'
import { App, Button, Layout, Menu, Result, Spin, Typography } from 'antd'
import {
  AreaChartOutlined,
  AuditOutlined,
  CheckCircleOutlined,
  CustomerServiceOutlined,
  DollarOutlined,
  LogoutOutlined,
  NotificationOutlined,
  ShoppingOutlined,
  TeamOutlined,
  ToolOutlined,
  WalletOutlined
} from '@ant-design/icons'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { adminApi } from '../lib/admin-api'
import { logout } from '../lib/cloudbase'
import { isSessionExpiredError } from '../lib/auth-errors.js'
import type { PermissionKey } from '../types/admin'

const menuItems: Array<{ key: string; icon: ReactNode; label: string; permission: PermissionKey }> = [
  { key: '/dashboard', icon: <AreaChartOutlined />, label: '经营看板', permission: 'dashboard.view' },
  { key: '/orders', icon: <WalletOutlined />, label: '订单退款', permission: 'orders.view' },
  { key: '/verification', icon: <CheckCircleOutlined />, label: '核销台', permission: 'orders.view' },
  { key: '/catalog', icon: <ShoppingOutlined />, label: '商品套餐', permission: 'catalog.manage' },
  { key: '/campaigns', icon: <NotificationOutlined />, label: '活动管理', permission: 'campaigns.manage' },
  { key: '/customers', icon: <CustomerServiceOutlined />, label: '客户运营', permission: 'crm.view' },
  { key: '/finance', icon: <DollarOutlined />, label: '财务中心', permission: 'orders.refund.review' },
  { key: '/settings', icon: <AuditOutlined />, label: '门店设置', permission: 'settings.manage' },
  { key: '/ops', icon: <ToolOutlined />, label: '审计运维', permission: 'staff.manage' },
  { key: '/staff', icon: <TeamOutlined />, label: '员工权限', permission: 'staff.manage' }
]

export function AdminShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const { message } = App.useApp()
  const sessionQuery = useQuery({
    queryKey: ['admin-me'],
    queryFn: adminApi.me
  })

  useEffect(() => {
    if (!sessionQuery.isError || !isSessionExpiredError(sessionQuery.error)) {
      return
    }

    logout().catch(() => null).finally(() => {
      navigate('/login', { replace: true })
    })
  }, [navigate, sessionQuery.error, sessionQuery.isError])

  const items = useMemo(() => {
    const permissions = sessionQuery.data?.permissions || []
    const routePermissions = sessionQuery.data?.routePermissions || {}
    return menuItems
      .filter(item => permissions.includes(routePermissions[item.key] || item.permission))
      .map(({ permission: _permission, ...item }) => item)
  }, [sessionQuery.data?.permissions, sessionQuery.data?.routePermissions])

  if (sessionQuery.isLoading) {
    return (
      <div className="fullscreen-center">
        <Spin size="large" />
      </div>
    )
  }

  if (sessionQuery.error || !sessionQuery.data) {
    return (
      <Result
        status="403"
        title="后台登录已失效"
        subTitle={sessionQuery.error instanceof Error ? sessionQuery.error.message : '请重新登录老板后台'}
        extra={<Button type="primary" onClick={() => navigate('/login', { replace: true })}>返回登录</Button>}
      />
    )
  }

  return (
    <Layout className="admin-shell">
      <Layout.Sider width={250} className="admin-sider">
        <div className="brand-panel">
          <div className="brand-kicker">ADMIN CONSOLE</div>
          <Typography.Title level={3} className="brand-title">
            {sessionQuery.data.storeName || '门店老板后台'}
          </Typography.Title>
          <Typography.Paragraph className="brand-copy">
            面向老板与店长的经营台，聚合订单、活动、客户和配置。
          </Typography.Paragraph>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={items}
          onClick={({ key }) => navigate(String(key))}
          className="admin-menu"
        />
      </Layout.Sider>
      <Layout>
        <Layout.Header className="admin-header">
          <div>
            <div className="page-kicker">STORE OPS</div>
            <div className="page-title">{sessionQuery.data.displayName || sessionQuery.data.username}</div>
          </div>
          <Button
            icon={<LogoutOutlined />}
            onClick={async () => {
              await logout().catch(() => null)
              message.success('已退出登录')
              navigate('/login', { replace: true })
            }}
          >
            退出登录
          </Button>
        </Layout.Header>
        <Layout.Content className="admin-content">
          <Outlet context={{ session: sessionQuery.data }} />
        </Layout.Content>
      </Layout>
    </Layout>
  )
}
