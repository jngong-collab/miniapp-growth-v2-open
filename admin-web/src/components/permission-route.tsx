import type { ReactElement } from 'react'
import { Result } from 'antd'
import { Navigate, useOutletContext } from 'react-router-dom'
import type { PermissionKey } from '../types/admin'
import { getFirstAllowedRoute } from '../lib/routing'

interface AdminOutletContext {
  session: import('../types/admin').AdminSession
}

export function PermissionRoute({
  requiredPermission,
  children
}: {
  requiredPermission: PermissionKey
  children: ReactElement
}) {
  const { session } = useOutletContext<AdminOutletContext>()

  if (!session.permissions.includes(requiredPermission)) {
    return <Result status="403" title="无访问权限" subTitle="当前账号无权访问该页面" />
  }

  return children
}

export function PermissionIndexRedirect() {
  const { session } = useOutletContext<AdminOutletContext>()
  const firstRoute = getFirstAllowedRoute(session)

  if (firstRoute) {
    return <Navigate to={firstRoute} replace />
  }

  return <Result status="403" title="无可访问页面" subTitle="当前账号尚未分配后台页面权限" />
}
