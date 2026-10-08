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
      if (e.props.hasSurvey || !home || !(await $.fs.exists(`${home}/.claude/.learn-mode`))) return next(e)

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
