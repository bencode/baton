import { defineCommand } from 'citty'
import { EventSource } from 'eventsource'
import { createClient, createWorkerClient } from '../../client.ts'
import type { SessionConfig } from '../../project-config.ts'
import type { FetchImpl } from '../../session/runner/attachments.ts'
import { type EventSourceLike, runDaemon } from '../../session/runner.ts'

// fetch that carries the worker Bearer — used to pull attachments into the
// worktree past the gated /sessions/:id/attachments/:id route.
const bearerFetch =
  (token: string): FetchImpl =>
  (input, init) =>
    fetch(input, {
      ...init,
      headers: {
        ...(init?.headers as Record<string, string> | undefined),
        authorization: `Bearer ${token}`,
      },
    })

// EventSource can't set headers directly; the `eventsource` package's `fetch`
// hook lets us attach the worker Bearer so the gated /stream endpoint accepts
// the child's subscription (same trick as the daemon's command stream).
const authedEventSource = (token: string): (new (url: string) => EventSourceLike) =>
  class extends EventSource {
    constructor(url: string) {
      super(url, {
        fetch: (u, init) =>
          fetch(u, {
            ...init,
            headers: {
              ...(init?.headers as Record<string, string>),
              authorization: `Bearer ${token}`,
            },
          }),
      })
    }
  } as unknown as new (
    url: string,
  ) => EventSourceLike

// Internal entry spawned by the worker daemon (not meant to be run by hand).
// Credentials arrive via env (BATON_SERVER / BATON_WORKER_TOKEN); the session
// metadata comes from the server. Runs the per-session daemon loop (subscribe +
// drain + spawn claude per turn).
export const sessionRunCommand = defineCommand({
  meta: { name: 'run', description: 'run a session child (spawned by the worker daemon)' },
  args: {
    session: { type: 'positional', required: true, description: 'session int id' },
  },
  run: async ({ args }) => {
    const server = process.env.BATON_SERVER
    const workerToken = process.env.BATON_WORKER_TOKEN
    if (!server || !workerToken)
      throw new Error('`session run` must be spawned by the worker daemon (missing BATON_* env)')
    const sessionId = Number(args.session)
    if (!Number.isInteger(sessionId) || sessionId <= 0)
      throw new Error(`invalid session id: ${args.session}`)
    // Bearer-mode client: the child authenticates reads with the worker token.
    const client = createClient(server, { bearer: workerToken })
    const s = await client.sessions.get(sessionId)
    if (!s.agentSessionId || !s.worktreePath)
      throw new Error(`session #${sessionId} is not materialized yet`)
    const config: SessionConfig = {
      server,
      sessionId,
      name: s.name,
      agentKind: s.agentKind,
      agentSessionId: s.agentSessionId,
      worktreePath: s.worktreePath,
    }
    const worker = createWorkerClient(server, workerToken, sessionId)
    const ac = new AbortController()
    const stop = (): void => ac.abort()
    process.on('SIGINT', stop)
    process.on('SIGTERM', stop)
    await runDaemon(
      config,
      {
        worker,
        eventSourceImpl: authedEventSource(workerToken),
        fetchImpl: bearerFetch(workerToken),
      },
      ac.signal,
    )
  },
})
