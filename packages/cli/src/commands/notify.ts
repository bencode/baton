import type { NotifyResult } from '@baton/shared'
import { defineCommand } from 'citty'
import { toJson } from '../output.ts'
import { clientFor, common } from '../util.ts'

const describe = (result: NotifyResult): string => {
  if (result.status === 'sent') return `notified ${result.devices} device(s)`
  if (result.status === 'throttled')
    return `throttled: this session can notify again in ${result.retryAfterSec}s`
  return 'nobody to notify: no human has messaged this session, or they have not enabled notifications'
}

export const notify = defineCommand({
  meta: {
    name: 'notify',
    description:
      'Push a phone notification to the person working with this session. Use it only when a human ' +
      'needs to act now: something is wrong, a decision is needed, or the work is blocked. Do not use ' +
      'it for routine progress, and not to announce that a turn finished (that is already pushed). ' +
      'At most one notification per session every 10 minutes; text is cut at 200 characters.',
  },
  args: {
    text: { type: 'positional', required: true, description: 'one short line for the lock screen' },
    ...common,
  },
  run: async ({ args }) => {
    const raw = process.env.BATON_SESSION_ID
    if (raw === undefined)
      throw new Error('baton notify only works inside a baton session (BATON_SESSION_ID is unset)')
    const sessionId = Number(raw)
    if (!Number.isSafeInteger(sessionId) || sessionId <= 0)
      throw new Error('invalid BATON_SESSION_ID')
    const result = await clientFor(args).sessions.notify(sessionId, args.text)
    console.log(args.json ? toJson(result) : describe(result))
  },
})
