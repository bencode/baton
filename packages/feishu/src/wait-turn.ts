import { agentMessageText, type SessionEvent } from '@baton/shared'

export type TurnOutcome = 'complete' | 'error' | 'timeout' | 'coalesced' | 'cancelled'
export type TurnResult = { outcome: TurnOutcome; text: string }
export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export const waitForTurn = async (
  streamUrl: string,
  inputId: number,
  timeoutMs: number,
  fetchImpl: FetchLike = fetch,
): Promise<TurnResult> => {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), timeoutMs)
  const seen = new Set<number>()
  let cursor: number | undefined
  let userMessageId: number | undefined
  let turnId: number | undefined
  let attemptId: number | undefined
  let inOurTurn = false
  let resultText = ''
  let lastAssistant = ''
  const accept = (event: SessionEvent): TurnResult | null => {
    if (seen.has(event.id)) return null
    seen.add(event.id)
    cursor = Math.max(cursor ?? -1, event.sequence)
    const payload = isRecord(event.payload) ? event.payload : {}
    if (
      event.type === 'queue_changed' &&
      Array.isArray(payload.cancelledIds) &&
      payload.cancelledIds.includes(inputId)
    )
      return { outcome: 'cancelled', text: '' }
    if (
      event.type === 'user_message' &&
      Array.isArray(payload.inputIds) &&
      payload.inputIds.includes(inputId)
    ) {
      if (payload.replyInputId !== inputId) return { outcome: 'coalesced', text: '' }
      userMessageId = event.id
    }
    if (event.type === 'turn_start') {
      const matches =
        userMessageId !== undefined
          ? payload.messageId === userMessageId
          : payload.messageId === inputId && !Array.isArray(payload.inputIds)
      if (matches) {
        inOurTurn = true
        turnId = typeof payload.turnId === 'number' ? payload.turnId : undefined
        attemptId = event.attemptId
        resultText = ''
        lastAssistant = ''
      }
      return null
    }
    const sameTurn = turnId !== undefined && payload.turnId === turnId
    if (event.type === 'turn_aborted' && (sameTurn || (inOurTurn && event.attemptId === attemptId)))
      return { outcome: 'error', text: '执行已停止' }
    if (!inOurTurn || event.attemptId !== attemptId) return null
    if (event.type === 'turn_complete')
      return { outcome: 'complete', text: resultText || lastAssistant }
    if (event.type === 'turn_error') {
      if (payload.retrying === true) {
        inOurTurn = false
        resultText = ''
        lastAssistant = ''
        return null
      }
      return {
        outcome: 'error',
        text: typeof payload.message === 'string' ? payload.message : '执行失败',
      }
    }
    if (event.type === 'agent_event') {
      const message = agentMessageText(payload)
      if (message) lastAssistant = message.text
    }
    if (event.type === 'sdk_event') {
      if (payload.type === 'result' && typeof payload.result === 'string')
        resultText = payload.result
      if (
        payload.type === 'assistant' &&
        isRecord(payload.message) &&
        Array.isArray(payload.message.content)
      )
        lastAssistant = payload.message.content
          .filter(isRecord)
          .filter(block => block.type === 'text' && typeof block.text === 'string')
          .map(block => block.text)
          .join('\n')
    }
    return null
  }
  try {
    while (!abort.signal.aborted) {
      const url = new URL(streamUrl, 'http://localhost')
      if (cursor !== undefined) url.searchParams.set('since', String(cursor))
      try {
        const response = await fetchImpl(cursor === undefined ? streamUrl : url.toString(), {
          signal: abort.signal,
        })
        if (!response.ok) {
          if (response.status >= 400 && response.status < 500)
            return { outcome: 'error', text: `读取执行结果失败（HTTP ${response.status}）` }
          throw new Error(`stream HTTP ${response.status}`)
        }
        const reader = response.body?.getReader()
        if (!reader) throw new Error('stream response has no body')
        const cancelReader = (): void => {
          void reader.cancel().catch(error => console.error('[wait-turn] cancel stream', error))
        }
        abort.signal.addEventListener('abort', cancelReader, { once: true })
        let buffer = ''
        const decoder = new TextDecoder()
        try {
          while (!abort.signal.aborted) {
            const { value, done } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''
            for (const line of lines) {
              if (!line.startsWith('data:')) continue
              const result = accept(JSON.parse(line.slice(5).trim()) as SessionEvent)
              if (result) return result
            }
          }
        } finally {
          abort.signal.removeEventListener('abort', cancelReader)
          await reader.cancel()
          reader.releaseLock()
        }
      } catch (error) {
        if (!abort.signal.aborted) console.error('[wait-turn] reconnecting', error)
      }
      if (!abort.signal.aborted)
        await new Promise<void>(resolve => {
          const onAbort = (): void => {
            clearTimeout(delay)
            resolve()
          }
          const delay = setTimeout(() => {
            abort.signal.removeEventListener('abort', onAbort)
            resolve()
          }, 300)
          abort.signal.addEventListener('abort', onAbort, { once: true })
        })
    }
    return { outcome: 'timeout', text: '' }
  } finally {
    clearTimeout(timer)
    abort.abort()
  }
}
