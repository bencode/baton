import { defineCommand } from 'citty'
import { clientFor, common } from '../../util.ts'

export const loopRmCommand = defineCommand({
  meta: { name: 'rm', description: 'delete a loop' },
  args: {
    loop: { type: 'positional', required: true, description: 'loop int id' },
    ...common,
  },
  run: async ({ args }) => {
    const c = clientFor(args)
    const id = Number(args.loop)
    await c.loops.remove(id)
    console.log(`deleted loop ${id}`)
  },
})
