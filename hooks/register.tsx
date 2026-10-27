import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { ZERO, addUsage, bandText, isHot } from './format'

const totals = atom({ plugin: 'learn-mode', key: 'totals' } as const, ZERO)

// 빈 문자열 = 아직 모르거나 effort 없는 모델 (밴드에서 생략)
const effort = atom({ plugin: 'learn-mode', key: 'effort' } as const, '' as string | number)

export const register: Register = on => {
  on('turn.complete', async ($, e, next) => {
    await update($, totals, t => addUsage(t, e.usage))
    return next(e)
  })

  // 메인 모델 요청만 (서브에이전트 step은 agentId가 붙음)
  on('turn.step', async function* ($, e, next) {
    if (!e.agentId) {
      const next_ = e.effort ?? ''
      if ((await read($, effort)) !== next_) await update($, effort, () => next_)
    }
    return yield* next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    try {
      const home = await $.env.get('HOME')
      if (e.props.hasSurvey || !home || !(await $.fs.exists(`${home}/.claude/.learn-mode`))) return next(e)

      const u = await $.session.usage()
      const t = await read($, totals)
      let model: string | undefined
      try { model = await $.session.model() } catch { /* 모델 구간만 생략 */ }
      const text = bandText({ model, effort: await read($, effort), percent: u.context.percent, usd: u.cost?.usd, totals: t })
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
