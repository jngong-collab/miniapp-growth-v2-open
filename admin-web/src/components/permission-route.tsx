import type { ReactElement } from 'react'
import { Result } from 'antd'
import { Navigate, useOutletContext } from 'react-router-dom'
import type { AdminSession, PermissionKey } from '../types/admin'

interface AdminOutletContext {
  session: AdminSession
}

export function getFirstAllowedRoute(session: Pick<AdminSession, 'permissions' | 'routePermissions'>) {
  for (const [routePath, permission] of Object.entries(session.routePermissions)) {
    if (session.permissions.includes(permission)) {
      return routePath
    }
  }

  return null
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
  const routePath = getFirstAllowedRoute(session)

  if (!routePath) {
    return <Result status="403" title="无可访问页面" subTitle="当前账号尚未分配后台页面权限" />
  }

  return <Navigate to={routePath} replace />
}
