import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { bandText, isHot } from './format'

// 마지막 메인 모델 응답의 출력 토큰 (상태줄의 ↓와 같은 의미)
const output = atom({ plugin: 'learn-mode', key: 'output' } as const, 0)

// 빈 문자열 = 아직 모르거나 effort 없는 모델 (밴드에서 생략)
const effort = atom({ plugin: 'learn-mode', key: 'effort' } as const, '' as string | number)

export const register: Register = on => {
  // 메인 모델 요청만 (서브에이전트 step은 agentId가 붙음)
  on('turn.step', async function* ($, e, next) {
    if (!e.agentId) {
      const next_ = e.effort ?? ''
      if ((await read($, effort)) !== next_) await update($, effort, () => next_)
    }
    const r = yield* next(e)
    // 응답 usage가 있는 메인 step만 ↓ 갱신 (없으면 이전 값 유지)
    if (!e.agentId && r.usage && (await read($, output)) !== r.usage.output_tokens) await update($, output, () => r.usage!.output_tokens)
    return r
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    try {
      const home = await $.env.get('HOME')
      if (e.surface === 'terminal' || e.props.hasSurvey || !home || !(await $.fs.exists(`${home}/.claude/.learn-mode`))) return next(e)

      const u = await $.session.usage()
      let model: string | undefined
      try { model = await $.session.model() } catch { /* 모델 구간만 생략 */ }
      const text = bandText({ model, effort: await read($, effort), percent: u.context.percent, usd: u.cost?.usd, tokens: u.context.tokens, output: await read($, output) })
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
