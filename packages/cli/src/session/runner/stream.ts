import { createInterface } from 'node:readline'
import type { Readable } from 'node:stream'
import type { WorkerClient } from '../../client.ts'

// Drain claude's stream-json stdout: one JSON-per-line → sdk_event events.
// Lines that don't parse become { raw } so we still surface them.
export const streamSdkEvents = async (stdout: Readable, worker: WorkerClient): Promise<void> => {
  const rl = createInterface({ input: stdout })
  for await (const line of rl) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let payload: unknown
    try {
      payload = JSON.parse(trimmed)
    } catch {
      payload = { raw: trimmed }
    }
    await worker.emitEvent('sdk_event', payload)
  }
}
