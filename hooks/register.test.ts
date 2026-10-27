import { test, expect } from 'claude-code/testing'
import type { On } from 'claude-code'

const usage = (over: object) => ({
  startedAt: 0,
  rateLimits: [],
  context: { window: 200000, percent: 42.7 },
  cost: { usd: 1.374 },
  ...over,
})

// 엔진 역할: 플러그인이 next(e)로 넘기면 빈 Box를 그린다
const world = (on: On, toggle: boolean, usageFn: () => unknown, base = { n: 0 }, modelFn: () => string = () => 'opus') => {
  on('session.model', async () => ({ value: modelFn() as never }))
  on('turn.step', async function* (_$, e) { return { turnId: e.turnId, index: e.index, answer: "", toolUses: [] } as never })
  on('fs.exists', async () => ({ value: toggle }))
  on('env.get', async () => ({ value: '/home/x' }))
  on('session.usage', async () => ({ value: usageFn() as never }))
  on('turn.complete', async () => ({ text: '' }))
  on('ui.render', async () => {
    base.n++
    return { type: 'Box', props: {}, children: [] }
  })
}

const turn = (usage?: object) => ({ answer: '', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer', usage }) as never
const U = (i: number, o: number, cr = 0, cc = 0) => ({ model: 'm', input_tokens: i, output_tokens: o, cache_read_input_tokens: cr, cache_creation_input_tokens: cc })

const step = (over: object = {}) => ({ turnId: 't', index: 0, model: 'opus', messageCount: 1, ...over }) as never
const drain = async (s: AsyncGenerator<unknown, unknown>) => { for await (const _ of s) { /* 소비 */ } }

const BAND = { plugin: 'learn-mode', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10 } } as const

for (const surface of ['terminal', 'desktop'] as const) {
  test(`밴드: 정상 값 (${surface})`, async ($, on) => {
    world(on, true, () => usage({}))
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /ctx 42%/ }))).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /\$1\.37/ }))).toBeDefined()
    await ui.unmount()
  })

  test(`밴드: 비용 없음은 $— (${surface})`, async ($, on) => {
    world(on, true, () => usage({ cost: undefined }))
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /\$—/ }))).toBeDefined()
    await ui.unmount()
  })

  test(`밴드: 토글 꺼짐이면 그리지 않음 (${surface})`, async ($, on) => {
    const base = { n: 0 }
    world(on, false, () => usage({}), base)
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /ctx/ })).toBeUndefined()
    expect(base.n).toBe(1) // 플러그인이 next(e)로 넘겼다
    await ui.unmount()
  })

  test(`밴드: usage 실패해도 렌더가 죽지 않음 (${surface})`, async ($, on) => {
    const base = { n: 0 }
    world(on, true, () => { throw new Error('boom') }, base)
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /ctx/ })).toBeUndefined()
    expect(base.n).toBe(1) // 플러그인이 next(e)로 넘겼다
    await ui.unmount()
  })

  test(`밴드: turn.complete 토큰 누적 (${surface})`, async ($, on) => {
    world(on, true, () => usage({}))
    await $.turn.complete(turn(U(200, 300, 900, 100))) // 입력 = 200+900+100
    await $.turn.complete(turn()) // usage 없으면 그대로
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /1\.2k↑ 300↓/ })).toBeDefined()
    await ui.unmount()
  })

  test(`밴드: 퍼센트 없음은 ctx — 이고 dim (${surface})`, async ($, on) => {
    world(on, true, () => usage({ context: { window: 200000 } }))
    const ui = await $.ui.mount({ ...BAND, surface })
    const t = await ui.find({ type: 'Text', text: /ctx —/ })
    expect(t).toBeDefined()
    expect(t!.props.dimColor).toBe(true)
    expect(t!.props.color).toBeUndefined()
    await ui.unmount()
  })

  test(`밴드: 80% 이상은 빨강 (${surface})`, async ($, on) => {
    world(on, true, () => usage({ context: { window: 200000, percent: 80 } }))
    const ui = await $.ui.mount({ ...BAND, surface })
    const t = await ui.find({ type: 'Text', text: /ctx 80%/ })
    expect(t!.props.color).toBe('red')
    await ui.unmount()
  })

  test(`밴드: 79%는 dim (${surface})`, async ($, on) => {
    world(on, true, () => usage({ context: { window: 200000, percent: 79.9 } }))
    const ui = await $.ui.mount({ ...BAND, surface })
    const t = await ui.find({ type: 'Text', text: /ctx 79%/ })
    expect(t!.props.dimColor).toBe(true)
    await ui.unmount()
  })

  test(`밴드: 설문 중이면 양보 (${surface})`, async ($, on) => {
    const base = { n: 0 }
    world(on, true, () => usage({}), base)
    const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, hasSurvey: true }, surface })
    expect(await ui.find({ type: 'Text', text: /ctx/ })).toBeUndefined()
    expect(base.n).toBe(1)
    await ui.unmount()
  })

  test(`밴드: 모델이 effort 앞에, effort는 첫 요청 전에는 없음 (${surface})`, async ($, on) => {
    world(on, true, () => usage({}))
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /^📚 opus · ctx 42%/ })).toBeDefined()
    await ui.unmount()
  })

  test(`밴드: 메인 turn.step의 effort 표시 (${surface})`, async ($, on) => {
    world(on, true, () => usage({}))
    await drain($.turn.step(step({ effort: 'high' })))
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /^📚 opus · high · ctx 42%/ })).toBeDefined()
    await ui.unmount()
  })

  test(`밴드: 서브에이전트 step은 effort를 바꾸지 않음 (${surface})`, async ($, on) => {
    world(on, true, () => usage({}))
    await drain($.turn.step(step({ effort: 'high' })))
    await drain($.turn.step(step({ effort: 'low', agentId: 'a1' })))
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /opus · high · ctx/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /low/ })).toBeUndefined()
    await ui.unmount()
  })

  test(`밴드: 숫자 effort (${surface})`, async ($, on) => {
    world(on, true, () => usage({}))
    await drain($.turn.step(step({ effort: 8000 })))
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /opus · 8000 · ctx/ })).toBeDefined()
    await ui.unmount()
  })

  test(`밴드: model() 실패는 모델만 빠지고 밴드는 그려짐 (${surface})`, async ($, on) => {
    world(on, true, () => usage({}), { n: 0 }, () => { throw new Error('boom') })
    await drain($.turn.step(step({ effort: 'high' })))
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /^📚 high · ctx 42%/ })).toBeDefined()
    await ui.unmount()
  })
}
