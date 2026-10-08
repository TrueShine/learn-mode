export type Totals = { input: number; output: number }

export const ZERO: Totals = { input: 0, output: 0 }

export function fmtTokens(n: number): string {
  if (n < 1000) return String(n)
  return `${Math.floor(n / 100) / 10}k`
}

export function addUsage(
  t: Totals,
  u?: { input_tokens: number; output_tokens: number },
): Totals {
  if (!u) return t
  return { input: t.input + u.input_tokens, output: t.output + u.output_tokens }
}

export const isHot = (percent?: number): boolean => (percent ?? 0) >= 80

export function bandText(p: { percent?: number; usd?: number; totals: Totals }): string {
  const ctx = p.percent === undefined ? '—' : `${Math.floor(p.percent)}%`
  const usd = p.usd === undefined ? '—' : p.usd.toFixed(2)
  return `📚 ctx ${ctx} · $${usd} · ${fmtTokens(p.totals.input)}↑ ${fmtTokens(p.totals.output)}↓`
}
