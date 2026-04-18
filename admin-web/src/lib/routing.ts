import type { AdminSession } from '../types/admin'

export function getFirstAllowedRoute(session: AdminSession): string | null {
  for (const [routePath, permission] of Object.entries(session.routePermissions)) {
    if (session.permissions.includes(permission)) {
      return routePath
    }
  }
  return null
}
