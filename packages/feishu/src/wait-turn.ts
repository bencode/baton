import type { SessionEvent } from '@baton/shared'

export type TurnOutcome = 'complete' | 'error' | 'timeout'
// outcome + the agent's answer text (so the Feishu reply can show it inline).
export type TurnResult = { outcome: TurnOutcome; text: string }
export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

// Concatenate the `text` blocks of an `{type:'assistant'}` stream-json message
// (loose parse — the SDK shape evolves; mirrors the web's event-render).
const assistantText = (payload: Record<string, unknown>): string => {
  const msg = payload.message
  if (!isRecord(msg) || !Array.isArray(msg.content)) return ''
  return msg.content
    .filter(isRecord)
    .filter(b => b.type === 'text' && typeof b.text === 'string')
    .map(b => b.text as string)
    .join('\n')
}

// Wait for the turn triggered by *our* message to finish, capturing the agent's
// answer along the way. We open the session stream with full replay (so a fast
// turn isn't missed) and correlate by messageId: turn_start carries
// { messageId } = our user_message's id, and the next turn_complete /
// turn_error after it is ours (ignoring other turns in a reused session). While
// in our turn we keep the latest `result` event's text (the canonical final
// answer), falling back to the last assistant message's text. Resolves 'timeout'
// (empty text) on the deadline or a closed stream; always aborts on resolve.
export const waitForTurn = async (
  streamUrl: string,
  messageId: number,
  timeoutMs: number,
  fetchImpl: FetchLike = fetch,
): Promise<TurnResult> => {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  let resultText = ''
  let lastAssistant = ''
  try {
    const res = await fetchImpl(streamUrl, { signal: ctrl.signal })
    const reader = res.body?.getReader()
    if (!reader) return { outcome: 'timeout', text: '' }
    const dec = new TextDecoder()
    let buf = ''
    let inOurTurn = false
    while (!ctrl.signal.aborted) {
      const { value, done } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        let ev: SessionEvent
        try {
          ev = JSON.parse(line.slice(5).trim()) as SessionEvent
        } catch {
          continue
        }
        if (
          ev.type === 'turn_start' &&
          isRecord(ev.payload) &&
          ev.payload.messageId === messageId
        ) {
          inOurTurn = true
          continue
        }
        if (!inOurTurn) continue
        if (ev.type === 'turn_complete')
          return { outcome: 'complete', text: resultText || lastAssistant }
        if (ev.type === 'turn_error') {
          const msg =
            isRecord(ev.payload) && typeof ev.payload.message === 'string' ? ev.payload.message : ''
          return { outcome: 'error', text: msg || resultText || lastAssistant }
        }
        if (ev.type === 'sdk_event' && isRecord(ev.payload)) {
          const p = ev.payload
          if (p.type === 'result' && typeof p.result === 'string') resultText = p.result
          else if (p.type === 'assistant') {
            const t = assistantText(p)
            if (t) lastAssistant = t
          }
        }
      }
    }
    return { outcome: 'timeout', text: '' }
  } catch {
    return { outcome: 'timeout', text: '' }
  } finally {
    clearTimeout(timer)
    ctrl.abort()
  }
}
