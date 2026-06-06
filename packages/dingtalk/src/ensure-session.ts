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
// subscribed). Returns false on timeout instead of throwing — messages queue
// server-side for unattached sessions, so the caller should still send and
// just tell the user the reply will arrive later (never drop the message).
const awaitActive = async (
  client: BatonClient,
  id: Id,
  opts: ActiveWaitOpts = {},
): Promise<boolean> => {
  // Cold spawn → subscribed routinely takes ~11s (worktree + SDK init); 30s
  // keeps healthy-but-cold workers out of the queued path.
  const { tries = 60, intervalMs = 500, sleep = realSleep } = opts
  for (let i = 0; i < tries; i++) {
    if ((await client.getSession(id)).attached) return true
    await sleep(intervalMs)
  }
  return false
}

// Resolve the session for a DingTalk conversation: reuse the bound one ONLY if
// it's still active (a daemon child is attached), else create + bind a fresh
// one. A bound session that's gone, stopped, or idle-auto-stopped (attached =
// false) is treated as a finished conversation — we start fresh rather than
// silently resuming stale context (so "write a new component" doesn't continue
// the old task). Manual web resume re-activates a session, so a later DingTalk
// message will continue it.
//
// `active: false` means the worker hasn't attached within the grace window
// (offline, or its command stream is mid-reconnect after a server restart).
// The session still exists and accepts messages — they queue until the worker
// picks the session up, so callers should send regardless and adjust only the
// reply (link now instead of waiting out the turn).
export const ensureSession = async (
  client: BatonClient,
  bindings: BindingStore,
  route: { projectId: Id; workerId: Id },
  key: string,
  opts: ActiveWaitOpts = {},
): Promise<{ id: Id; active: boolean }> => {
  const existing = bindings.get(key)
  if (existing !== undefined) {
    const s = await client.getSession(existing).catch(() => null)
    // Reuse only an active (attached) session. Stopped / auto-stopped ones fall
    // through to a fresh session below — don't auto-resume stale context.
    if (s?.attached) return { id: s.id, active: true }
  }
  const created = await client.createSession(route.projectId, route.workerId)
  bindings.set(key, created.id)
  return { id: created.id, active: await awaitActive(client, created.id, opts) }
}
