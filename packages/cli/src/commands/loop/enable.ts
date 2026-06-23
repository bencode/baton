import { defineCommand } from 'citty'
import { fmtLoop, renderOne } from '../../output.ts'
import { clientFor, common } from '../../util.ts'

export const loopEnableCommand = defineCommand({
  meta: { name: 'enable', description: 'enable (resume) a loop' },
  args: {
    loop: { type: 'positional', required: true, description: 'loop int id' },
    ...common,
  },
  run: async ({ args }) => {
    const c = clientFor(args)
    const loop = await c.loops.update(Number(args.loop), { enabled: true })
    console.log(renderOne(loop, fmtLoop, Boolean(args.json)))
  },
})
