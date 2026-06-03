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
// subscribed). Throws on timeout so the caller can tell Feishu the worker
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

// Resolve the session for a Feishu conversation: reuse the bound one ONLY if
// it's still active (a daemon child is attached), else create + bind a fresh
// one. A bound session that's gone, stopped, or idle-auto-stopped (attached =
// false) is treated as a finished conversation — we start fresh rather than
// silently resuming stale context (so "write a new component" doesn't continue
// the old task). Manual web resume re-activates a session, so a later Feishu
// message will continue it. Returns an active session id ready for a message.
export const ensureSession = async (
  client: BatonClient,
  bindings: BindingStore,
  route: { projectId: Id; workerId: Id },
  key: string,
  opts: ActiveWaitOpts = {},
): Promise<Id> => {
  const existing = bindings.get(key)
  if (existing !== undefined) {
    const s = await client.getSession(existing).catch(() => null)
    // Reuse only an active (attached) session. Stopped / auto-stopped ones fall
    // through to a fresh session below — don't auto-resume stale context.
    if (s?.attached) {
      await awaitActive(client, s.id, opts)
      return s.id
    }
  }
  const created = await client.createSession(route.projectId, route.workerId)
  bindings.set(key, created.id)
  await awaitActive(client, created.id, opts)
  return created.id
}
