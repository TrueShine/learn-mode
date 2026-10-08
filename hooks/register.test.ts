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
const world = (on: On, toggle: boolean, usageFn: () => unknown) => {
  on('fs.exists', async () => ({ value: toggle }))
  on('env.get', async () => ({ value: '/home/x' }))
  on('session.usage', async () => ({ value: usageFn() as never }))
  on('ui.render', async () => ({ type: 'Box', props: {}, children: [] }))
}

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
    world(on, false, () => usage({}))
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /ctx/ })).toBeUndefined()
    await ui.unmount()
  })

  test(`밴드: usage 실패해도 렌더가 죽지 않음 (${surface})`, async ($, on) => {
    world(on, true, () => { throw new Error('boom') })
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /ctx/ })).toBeUndefined()
    await ui.unmount()
  })
}
