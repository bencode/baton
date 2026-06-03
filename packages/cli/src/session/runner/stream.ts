import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import type { WorkerClient } from '../../client.ts'

// The bits of the terminal `result` message a turn needs to finalize. isError
// folds is_error and any non-success subtype (error_max_turns, …) together.
export type TurnResult = { subtype: string; isError: boolean; resultText: string }

// Drain the SDK message stream: forward every message verbatim as an sdk_event
// (its JSON shape matches the old stream-json lines, so storage + web rendering
// are unchanged), and capture the final `result` message for the caller. Null
// when the stream ends without one (e.g. aborted mid-turn).
export const streamSdkEvents = async (
  messages: AsyncIterable<SDKMessage>,
  worker: WorkerClient,
): Promise<TurnResult | null> => {
  let result: TurnResult | null = null
  for await (const message of messages) {
    await worker.emitEvent('sdk_event', message)
    if (message.type === 'result') result = toTurnResult(message)
  }
  return result
}

const toTurnResult = (message: SDKMessage & { type: 'result' }): TurnResult => {
  const rec = message as unknown as Record<string, unknown>
  const subtype = typeof rec.subtype === 'string' ? rec.subtype : 'unknown'
  const isError = rec.is_error === true || subtype !== 'success'
  const resultText = typeof rec.result === 'string' ? rec.result : ''
  return { subtype, isError, resultText }
}
