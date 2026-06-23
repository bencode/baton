import { defineCommand } from 'citty'
import type { LoopUpdateInput } from '../../client.ts'
import { fmtLoop, renderOne } from '../../output.ts'
import { clientFor, common, parseDuration } from '../../util.ts'

// Update a loop's message / interval / label. Changing the interval re-anchors
// the next beat server-side. Use `enable` / `disable` for the on/off toggle.
export const loopSetCommand = defineCommand({
  meta: { name: 'set', description: 'update a loop (message / interval / name)' },
  args: {
    loop: { type: 'positional', required: true, description: 'loop int id' },
    message: { type: 'string', description: 'new message' },
    every: { type: 'string', description: 'new interval: 90s / 30m / 2h / 1d' },
    name: { type: 'string', description: 'new label' },
    ...common,
  },
  run: async ({ args }) => {
    const c = clientFor(args)
    const patch: LoopUpdateInput = {}
    if (args.message !== undefined) patch.message = args.message
    if (args.every !== undefined && args.every !== '') patch.intervalSec = parseDuration(args.every)
    if (args.name !== undefined) patch.name = args.name
    const loop = await c.loops.update(Number(args.loop), patch)
    console.log(renderOne(loop, fmtLoop, Boolean(args.json)))
  },
})
