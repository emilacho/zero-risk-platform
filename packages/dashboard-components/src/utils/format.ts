/**
 * Small formatting helpers shared across the dashboard components.
 * Kept local (no external dep) — host app can swap to `Intl` or `date-fns`
 * by re-implementing the same export shape.
 */

export function formatCurrency(usd: number, opts: { compact?: boolean } = {}): string {
  if (opts.compact && Math.abs(usd) >= 1000) {
    return `$${(usd / 1000).toFixed(usd >= 10000 ? 0 : 1)}k`
  }
  if (Math.abs(usd) < 1) {
    return `$${usd.toFixed(3)}`
  }
  return `$${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatNumber(n: number, opts: { compact?: boolean } = {}): string {
  if (opts.compact) {
    if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  }
  return n.toLocaleString('en-US')
}

export function formatPercent(p: number, opts: { signed?: boolean; digits?: number } = {}): string {
  const d = opts.digits ?? 1
  const sign = opts.signed && p > 0 ? '+' : ''
  return `${sign}${p.toFixed(d)}%`
}

export function formatRelativeTime(iso: string, now = new Date()): string {
  const then = new Date(iso)
  const diffMs = now.getTime() - then.getTime()
  const sec = Math.floor(diffMs / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}
