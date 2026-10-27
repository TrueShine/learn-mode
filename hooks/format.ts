export function fmtTokens(n: number): string {
  if (n < 1000) return String(n)
  return `${Math.floor(n / 100) / 10}k`
}

export const isHot = (percent?: number): boolean => (percent ?? 0) >= 80

export function bandText(p: { model?: string; effort?: string | number; percent?: number; usd?: number; tokens?: number; output: number }): string {
  const ctx = p.percent === undefined ? '—' : `${Math.floor(p.percent)}%`
  const usd = p.usd === undefined ? '—' : p.usd.toFixed(2)
  const head = [p.model, p.effort].map(v => (v === undefined ? '' : String(v))).filter(Boolean).map(v => `${v} · `).join('')
  return `📚 ${head}ctx ${ctx} · $${usd} · ${p.tokens === undefined ? '—' : fmtTokens(p.tokens)}↑ ${fmtTokens(p.output)}↓`
}
