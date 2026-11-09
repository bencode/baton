import type { Id, SessionEvent, SubmitInputResult, UserMessagePayload } from '@baton/shared'
import { defineCommand } from 'citty'
import { type ApiClient, createClient } from '../../client.ts'
import { resolveBaseUrl } from '../../config.ts'
import { toJson } from '../../output.ts'
import { common } from '../../util.ts'

export const TELL_LOOP_LIMIT = 10

const TELL_HEADER = /^\[Message from baton session #\d+ /gm

export type TellInput = { fromId: Id; toId: Id; body: string }

export const renderTell = (from: { id: Id; name: string }, body: string): string =>
  [
    `[Message from baton session #${from.id} ${JSON.stringify(from.name)}]`,
    `To reply, run: baton session tell ${from.id} "<your reply>"`,
    'Reply only if a response is actually needed.',
    '',
    body,
  ].join('\n')

const headerCount = (event: SessionEvent): number => {
  const text = (event.payload as Partial<UserMessagePayload> | null)?.text ?? ''
  return text.match(TELL_HEADER)?.length ?? 0
}

// Agent messages received since the last message from anyone else. The queue can
// merge several into one user_message, so each header counts.
export const countConsecutiveTells = (events: readonly SessionEvent[]): number => {
  const newestFirst = events
    .filter(event => event.type === 'user_message')
    .map(headerCount)
    .reverse()
  const end = newestFirst.indexOf(0)
  return (end < 0 ? newestFirst : newestFirst.slice(0, end)).reduce((sum, n) => sum + n, 0)
}

// Sessions only talk through messages, so the loop guard reads the sender's own
// history and never the target's.
export const sendTell = async (
  c: ApiClient,
  { fromId, toId, body }: TellInput,
): Promise<SubmitInputResult> => {
  if (body.trim() === '') throw new Error('nothing to send: message text is empty')
  if (toId === fromId) throw new Error('cannot tell your own session')
  const [from, events] = await Promise.all([c.sessions.get(fromId), c.sessions.listEvents(fromId)])
  const received = countConsecutiveTells(events)
  if (received >= TELL_LOOP_LIMIT)
    throw new Error(
      `not sent: this session received ${received} agent messages in a row. Stop and ask a human; a message from them resets the count.`,
    )
  return c.sessions.sendMessage(toId, renderTell(from, body))
}

const parseId = (raw: string | undefined): Id | null =>
  raw !== undefined && /^[1-9]\d*$/.test(raw) ? Number(raw) : null

export const sessionTellCommand = defineCommand({
  meta: {
    name: 'tell',
    description:
      'Send a message to another agent session in this workspace. It includes who sent it and how ' +
      'to reply, and wakes the target if needed. Delivery is fire-and-forget: end your turn, and any ' +
      'reply arrives as a new message. You cannot read another session; ask it instead.',
  },
  args: {
    session: { type: 'positional', required: true, description: 'target session int id' },
    text: { type: 'positional', required: true, description: 'message text' },
    ...common,
  },
  run: async ({ args }) => {
    const fromId = parseId(process.env.BATON_SESSION_ID)
    const bearer = process.env.BATON_WORKER_TOKEN
    if (fromId === null || !bearer)
      throw new Error('baton session tell only works inside a baton session')
    const toId = parseId(args.session)
    if (toId === null) throw new Error(`invalid session "${args.session}": pass the session id`)
    // Always the worker token: a personal BATON_TOKEN could cross workspaces.
    const client = createClient(resolveBaseUrl(args.url), { bearer })
    const result = await sendTell(client, { fromId, toId, body: args.text })
    console.log(args.json ? toJson(result) : `told session #${toId} (input ${result.input.id})`)
  },
})
