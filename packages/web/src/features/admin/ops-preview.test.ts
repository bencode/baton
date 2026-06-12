import type { SessionEvent } from '@baton/shared'
import { describe, expect, test } from 'vitest'
import { eventsToPreview } from './ops-preview'

let seq = 0
const ev = (type: SessionEvent['type'], payload: unknown): SessionEvent => ({
  id: ++seq,
  sessionId: 1,
  sequence: seq,
  type,
  payload,
  createdAt: 0,
})

const sdk = (payload: unknown) => ev('sdk_event', payload)

describe('eventsToPreview', () => {
  test('folds user / tool / text / error into tinted single lines', () => {
    const events = [
      ev('user_message', { text: 'fix the\n  bug' }),
      ev('turn_start', { messageId: 1 }),
      sdk({
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Looking into it.' },
            { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'pnpm test' } },
          ],
        },
      }),
      ev('turn_error', { message: 'boom' }),
    ]
    expect(eventsToPreview(events)).toEqual([
      { tone: 'user', text: 'you› fix the bug' }, // whitespace flattened
      { tone: 'text', text: 'Looking into it.' },
      { tone: 'tool', text: '► Bash {"command":"pnpm test"}' },
      { tone: 'error', text: '✗ boom' },
    ])
  })

  test('caps at the newest 30 lines and clips long text', () => {
    const events = Array.from({ length: 40 }, (_, i) => {
      const e = ev('user_message', { text: `msg-${i} ${'x'.repeat(300)}` })
      return [e, ev('turn_start', { messageId: e.id })]
    }).flat()
    const lines = eventsToPreview(events)
    expect(lines).toHaveLength(30)
    expect(lines[0]?.text.startsWith('you› msg-10')).toBe(true)
    expect(lines[0]?.text.endsWith('…')).toBe(true)
    expect(lines[0]?.text.length).toBeLessThanOrEqual(210)
  })
})
