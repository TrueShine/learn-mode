# 데스크탑 상태 밴드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 데스크탑·터미널 입력창 위에 `📚 ctx 42% · $1.37 · 15.5k↑ 1.2k↓` 한 줄 밴드를 표시한다.

**Architecture:** 순수 함수(`hooks/format.ts`: 문자열 조립, 토큰 누적)와 엔진 연결 코드(`hooks/register.tsx`: `ui.render` 훅 + `turn.complete` 훅)를 분리한다. 컨텍스트·비용은 렌더 때마다 `$.session.usage()`(호출 비용 없음)로 읽고, 토큰 합계만 `turn.complete`에서 누적해 atom에 둔다.

**Tech Stack:** Claude Code 플러그인 훅 모듈(TypeScript/TSX), `claude plugin validate`, `claude plugin test`

**Spec:** `docs/superpowers/specs/2026-10-07-desktop-band-design.md`

## Global Constraints

- 표시 형식: `📚 ctx {pct}% · ${usd} · {in}↑ {out}↓`. 토큰은 1000 이상이면 `15.5k`(소수 첫째 자리, 버림), 비용은 소수 둘째 자리, 비용 없음은 `$—`, 퍼센트 없음은 `ctx —`
- 컨텍스트 80% 이상이면 빨간색, 그 외는 흐린 글씨(`dimColor`)
- 토글 파일: `~/.claude/.learn-mode` (없으면 밴드를 그리지 않고 `next(e)`만 호출)
- 모든 훅은 항상 `next(e)`를 호출한다. `usage()` 실패는 밴드만 숨기고 세션은 계속 진행한다
- 필드 이름(엔진 타입 정의로 확인): `SessionUsage.context.percent?`, `SessionUsage.cost?.usd`, `turn.complete`의 `e.usage?.input_tokens` / `output_tokens`, `$.env.get('HOME')`, `$.fs.exists(path)`
- 범위 밖: 토스트, `/learn-status` 명령, 레이트리밋 표시, 터미널 statusLine 변경
- 기존 `hooks.json`의 `hooks` 키와 `scripts/`, `skills/`, `test.sh`는 건드리지 않는다

## Review Focus

1. `usage()`가 `cost`를 주지 않음(`cost` 없음): `$—`로 표시하고 나머지는 정상.
2. `context.percent`가 없음: `ctx —`로 표시하고 빨강 판정은 하지 않는다.
3. `usage()`가 예외를 던짐: 밴드를 그리지 않고 렌더가 죽지 않는다.
4. 토큰이 0이거나 999/1000 경계: `0`, `999`, `1.0k`로 표시한다.
5. `turn.complete`에 `usage`가 없음(중단된 턴): 합계를 그대로 유지한다.

---

### Task 1: 순수 함수 (`format.ts`)

**Files:**
- Create: `hooks/format.ts`
- Test: `hooks/format.test.ts`

**Interfaces:**
- Produces:
  - `export type Totals = { input: number; output: number }`
  - `export const ZERO: Totals`
  - `export function fmtTokens(n: number): string`
  - `export function addUsage(t: Totals, u?: { input_tokens: number; output_tokens: number }): Totals`
  - `export function bandText(p: { percent?: number; usd?: number; totals: Totals }): string`
  - `export function isHot(percent?: number): boolean` (80 이상이면 true)

- [ ] **Step 1: 실패하는 테스트 작성**

`hooks/format.test.ts`:

```ts
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
```

- [ ] **Step 2: 실패 확인**

Run: `claude plugin test /Users/jiukryu/Documents/demo/learn-mode`
Expected: FAIL (`./format` 모듈 없음)

- [ ] **Step 3: 최소 구현**

`hooks/format.ts`:

```ts
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
```

- [ ] **Step 4: 통과 확인**

Run: `claude plugin test /Users/jiukryu/Documents/demo/learn-mode`
Expected: format 테스트 5개 PASS. (`fmtTokens(1000)`은 `Math.floor(10)/10 = 1` → `1k`.)

- [ ] **Step 5: 커밋**

```bash
git add hooks/format.ts hooks/format.test.ts
git commit -m "feat: 밴드 표시용 순수 함수 추가

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 엔진 연결 (`register.tsx`)와 로드 설정

**Files:**
- Create: `hooks/register.tsx`
- Create: `types/index.d.ts`
- Modify: `hooks/hooks.json` (최상위에 `"modules": ["./register.tsx"]` 추가, 기존 `hooks` 키 유지)
- Modify: `.claude-plugin/plugin.json` (`"types": "./types/index.d.ts"` 추가)
- Test: `hooks/register.test.ts`

**Interfaces:**
- Consumes: Task 1의 `ZERO`, `addUsage`, `bandText`, `isHot`, `Totals`
- Produces: `register`(Register): `turn.complete` 훅(토큰 누적 후 atom 갱신), `ui.render { component: 'AbovePrompt' }` 훅(밴드 그리기)

- [ ] **Step 0: 엔진 API 이름 재확인 (코드 쓰기 전, 1분)**

Run:
```bash
D=$(ls -d /private/tmp/claude-501/bundled-skills/*/*/plugin-authoring/types/claude-code.d.ts | tail -1)
grep -n "'session.usage'\|'fs.exists'\|'env.get'" "$D" | head
grep -n "AbovePrompt: {" "$D"
```
Expected: 위 이벤트들이 나온다. `AbovePrompt: {` 아래 `props` 형태를 읽고, 아래 테스트·코드의 `props: { hasSurvey: false }`가 맞는지 확인한다. 다르면 그 타입이 요구하는 필드로 고치고 보고서에 적는다.

- [ ] **Step 1: 실패하는 테스트 작성**

`hooks/register.test.ts`:

```ts
import { test, expect } from 'claude-code/testing'

const usage = (over: object) => ({
  startedAt: 0,
  rateLimits: [],
  context: { window: 200000, percent: 42.7 },
  cost: { usd: 1.374 },
  ...over,
})

const BAND = { plugin: 'learn-mode', component: 'AbovePrompt', props: { hasSurvey: false } } as const

for (const surface of ['terminal', 'desktop'] as const) {
  test(`밴드: 정상 값 (${surface})`, async ($, on) => {
    on('fs.exists', () => true)
    on('env.get', () => '/home/x')
    on('session.usage', () => usage({}))
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /ctx 42%/ }))).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /\$1\.37/ }))).toBeDefined()
    await ui.unmount()
  })

  test(`밴드: 비용 없음은 $— (${surface})`, async ($, on) => {
    on('fs.exists', () => true)
    on('env.get', () => '/home/x')
    on('session.usage', () => usage({ cost: undefined }))
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /\$—/ }))).toBeDefined()
    await ui.unmount()
  })

  test(`밴드: 토글 꺼짐이면 그리지 않음 (${surface})`, async ($, on) => {
    on('fs.exists', () => false)
    on('env.get', () => '/home/x')
    on('session.usage', () => usage({}))
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /ctx/ })).toBeUndefined()
    await ui.unmount()
  })

  test(`밴드: usage 실패해도 렌더가 죽지 않음 (${surface})`, async ($, on) => {
    on('fs.exists', () => true)
    on('env.get', () => '/home/x')
    on('session.usage', () => { throw new Error('boom') })
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /ctx/ })).toBeUndefined()
    await ui.unmount()
  })
}
```

- [ ] **Step 2: 실패 확인**

Run: `claude plugin test /Users/jiukryu/Documents/demo/learn-mode`
Expected: register 테스트 FAIL (모듈이 아직 로드되지 않아 `ctx` 텍스트 없음)

- [ ] **Step 3: 구현**

`types/index.d.ts`:

```ts
declare module 'claude-code' {
  interface PluginState {
    'learn-mode': { totals: { input: number; output: number } }
  }
}
export {}
```

`.claude-plugin/plugin.json` (전체):

```json
{
  "name": "learn-mode",
  "version": "0.2.0",
  "description": "학습 모드: 변경사항 3줄 설명 + 컨텍스트·비용 상태줄·밴드",
  "author": { "name": "TrueShine" },
  "types": "./types/index.d.ts"
}
```

`hooks/hooks.json` (전체):

```json
{
  "modules": ["./register.tsx"],
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          { "type": "command", "command": "sh \"${CLAUDE_PLUGIN_ROOT}/hooks/session-start.sh\"" }
        ]
      }
    ]
  }
}
```

`hooks/register.tsx`:

```tsx
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { ZERO, addUsage, bandText, isHot } from './format'

const totals = atom({ plugin: 'learn-mode', key: 'totals' } as const, ZERO)

export const register: Register = on => {
  on('turn.complete', async ($, e, next) => {
    await update($, totals, t => addUsage(t, e.usage))
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    try {
      const home = await $.env.get('HOME')
      if (!home || !(await $.fs.exists(`${home}/.claude/.learn-mode`))) return next(e)

      const u = await $.session.usage()
      const t = await read($, totals)
      const text = bandText({ percent: u.context.percent, usd: u.cost?.usd, totals: t })
      const { Box, Text } = $.ui.resolve(e)

      return (
        <Box>
          {isHot(u.context.percent) ? <Text color="red">{text}</Text> : <Text dimColor>{text}</Text>}
        </Box>
      )
    } catch {
      return next(e)
    }
  })
}
```

- [ ] **Step 4: 검증**

Run:
```bash
claude plugin validate /Users/jiukryu/Documents/demo/learn-mode
claude plugin test /Users/jiukryu/Documents/demo/learn-mode
sh test.sh
```
Expected: validate 오류 없음, 플러그인 테스트 전부 PASS, `sh test.sh`는 `ALL PASS`.
`validate`가 `hooks`와 `modules`를 한 파일에 두는 것을 거부하면: `hooks/hooks.json`은 기존 내용(`modules` 없이)으로 되돌리고, 모듈은 `desktop-band/` 폴더(자체 `.claude-plugin/plugin.json`, `hooks/hooks.json` = `{ "modules": ["./register.tsx"] }`, `types/`)로 옮긴 뒤 보고서에 DONE_WITH_CONCERNS로 적는다.

- [ ] **Step 5: 커밋**

```bash
git add hooks types .claude-plugin
git commit -m "feat: 입력창 위 컨텍스트·비용 밴드 모듈 추가

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 실제 앱 로드 확인 (컨트롤러 + 사용자)

**Files:**
- Modify: `README.md` (밴드 설명과 로드 방법 3줄 추가)

- [ ] **Step 1: 핫 리로드 폴더에 연결**

플러그인 저장소는 핫 리로드 감시 폴더 밖에 있으므로, 이 세션의 감시 폴더에 심볼릭 링크를 건다.

```bash
ln -s <learn-mode 저장소 경로> ~/.claude/dev-mods/<세션 폴더>/learn-mode
```
Expected: 사용자에게 "Enable hot reloading for this session?" 질문이 뜬다. **사용자가 직접 답해야 한다.** `Enable for this session`을 고르면 턴 종료 시 플러그인이 로드된다.

- [ ] **Step 2: 사용자가 데스크탑에서 확인**

Expected: 입력창 위에 `📚 ctx N% · $X.XX · ...` 한 줄이 보인다. 비용이 `$—`로 나오면 데스크탑이 비용 기록을 주지 않는 것이다(문서에 있는 경우이며 `/usage`로 보완).

- [ ] **Step 3: README 보강, 커밋, 푸시**

README의 설치 절 아래에 추가하고 커밋한다.

```bash
git add README.md
git commit -m "docs: 입력창 밴드 안내 추가

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push
```
