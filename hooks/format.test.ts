import { test, expect } from 'claude-code/testing'
import { ZERO, addUsage, bandText, fmtTokens, isHot } from './format'

test('fmtTokens: 경계와 소수 첫째 자리 버림', () => {
  expect(fmtTokens(0)).toBe('0')
  expect(fmtTokens(999)).toBe('999')
  expect(fmtTokens(1000)).toBe('1k')
  expect(fmtTokens(1200)).toBe('1.2k')
  expect(fmtTokens(15500)).toBe('15.5k')
  expect(fmtTokens(15599)).toBe('15.5k')
})

test('addUsage: 캐시 토큰도 입력에 합산', () => {
  const u = { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 900, cache_creation_input_tokens: 50 }
  expect(addUsage(ZERO, u)).toEqual({ input: 1050, output: 20 })
  expect(addUsage(ZERO, { input_tokens: 7, output_tokens: 1 })).toEqual({ input: 7, output: 1 })
})

test('addUsage: 누적, usage 없으면 그대로', () => {
  const a = addUsage(ZERO, { input_tokens: 100, output_tokens: 20 })
  expect(a).toEqual({ input: 100, output: 20 })
  expect(addUsage(a, undefined)).toEqual(a)
  expect(addUsage(a, { input_tokens: 5, output_tokens: 1 })).toEqual({ input: 105, output: 21 })
})

test('bandText: 정상 값', () => {
  expect(bandText({ percent: 42.7, usd: 1.374, totals: { input: 15500, output: 1200 } }))
    .toBe('📚 ctx 42% · $1.37 · 15.5k↑ 1.2k↓')
})

test('bandText: 비용 없음, 퍼센트 없음', () => {
  expect(bandText({ percent: 10, totals: ZERO })).toBe('📚 ctx 10% · $— · 0↑ 0↓')
  expect(bandText({ usd: 0, totals: ZERO })).toBe('📚 ctx — · $0.00 · 0↑ 0↓')
})

test('isHot: 80 이상', () => {
  expect(isHot(79.9)).toBe(false)
  expect(isHot(80)).toBe(true)
  expect(isHot(undefined)).toBe(false)
})
