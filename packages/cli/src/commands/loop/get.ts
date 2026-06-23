import { defineCommand } from 'citty'
import { fmtLoop, renderOne } from '../../output.ts'
import { clientFor, common } from '../../util.ts'

export const loopGetCommand = defineCommand({
  meta: { name: 'get', description: 'show one loop' },
  args: {
    loop: { type: 'positional', required: true, description: 'loop int id' },
    ...common,
  },
  run: async ({ args }) => {
    const c = clientFor(args)
    const loop = await c.loops.get(Number(args.loop))
    console.log(renderOne(loop, fmtLoop, Boolean(args.json)))
  },
})
