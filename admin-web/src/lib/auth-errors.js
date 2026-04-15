/**
 * CloudBase may surface expired or missing login state as a generic permission error
 * before the function code runs. Treat those cases as "go back to login".
 * @param {unknown} error
 * @returns {boolean}
 */
export function isSessionExpiredError(error) {
  const message = error instanceof Error ? error.message : String(error || '')
  const normalized = message.toLowerCase()

  return (
    normalized.includes('permission_denied') ||
    normalized.includes('permission denied') ||
    normalized.includes('未登录') ||
    normalized.includes('登录状态已失效') ||
    normalized.includes('后台登录已失效')
  )
}
