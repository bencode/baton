import type { Id } from '@baton/shared'
import type { BindingStore } from './bindings.ts'
import type { BatonClient } from './client.ts'

export type ActiveWaitOpts = {
  tries?: number
  intervalMs?: number
  sleep?: (ms: number) => Promise<void>
}

const realSleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms))

// Poll the session view until the worker reports it active (child spawned +
// subscribed). Throws on timeout so the caller can tell DingTalk the worker
// isn't reachable rather than dropping the message into the void.
const awaitActive = async (
  client: BatonClient,
  id: Id,
  opts: ActiveWaitOpts = {},
): Promise<void> => {
  const { tries = 20, intervalMs = 500, sleep = realSleep } = opts
  for (let i = 0; i < tries; i++) {
    if ((await client.getSession(id)).attached) return
    await sleep(intervalMs)
  }
  throw new Error(`session ${id} did not become active in time (worker offline?)`)
}

// Resolve the session for a DingTalk conversation: reuse the bound one (resuming
// if its worker child isn't running), or create + bind a fresh one. Returns an
// active session id ready to receive a message. A bound session that no longer
// exists server-side falls through to a new one.
export const ensureSession = async (
  client: BatonClient,
  bindings: BindingStore,
  route: { projectId: Id; workerId: Id },
  conversationId: string,
  opts: ActiveWaitOpts = {},
): Promise<Id> => {
  const existing = bindings.get(conversationId)
  if (existing !== undefined) {
    const s = await client.getSession(existing).catch(() => null)
    if (s) {
      if (!s.attached) await client.resumeSession(s.id)
      await awaitActive(client, s.id, opts)
      return s.id
    }
  }
  const created = await client.createSession(route.projectId, route.workerId)
  bindings.set(conversationId, created.id)
  await awaitActive(client, created.id, opts)
  return created.id
}
