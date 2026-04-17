export function fenToYuanInput(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined
  const amount = Number(value)
  if (!Number.isFinite(amount)) return undefined
  return Number((amount / 100).toFixed(2))
}

export function yuanToFen(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined
  const amount = Number(value)
  if (!Number.isFinite(amount)) return undefined
  return Math.round(amount * 100)
}
