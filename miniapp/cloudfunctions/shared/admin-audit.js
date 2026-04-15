function buildAdminAuditEntry(input, serverDate) {
  return {
    actorUid: String(input.actorUid || '').trim(),
    actorName: input.actorName || '管理员',
    action: String(input.action || '').trim(),
    module: String(input.module || '').trim(),
    targetType: String(input.targetType || '').trim(),
    targetId: String(input.targetId || '').trim(),
    summary: input.summary || '',
    detail: input.detail || {},
    storeId: String(input.storeId || '').trim(),
    createdAt: serverDate || new Date()
  }
}

module.exports = {
  buildAdminAuditEntry
}
