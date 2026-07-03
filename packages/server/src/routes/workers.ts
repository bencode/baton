import type { AgentKind, Id } from '@baton/shared'
import type { Hono } from 'hono'
import type { CommandBus } from '../command-bus.ts'
import { workerBearerAuth } from '../middleware/auth.ts'
import { assertProjectAccess } from '../middleware/domain-scope.ts'
import type { ProjectBus } from '../project-bus.ts'
import type { SessionRuntime } from '../session-runtime.ts'
import { streamBus } from '../sse.ts'
import type { Store } from '../store/types.ts'
import type { TerminalBridge } from '../terminal-bridge.ts'
import { type AppEnv, intParam, workerWithView } from '../views.ts'

const parseAgentKind = (value: unknown): AgentKind | null =>
  value === undefined || value === null || value === ''
    ? 'claude-code'
    : value === 'claude-code' || value === 'codex'
      ? value
      : null

export const registerWorkerRoutes = (
  app: Hono<AppEnv>,
  store: Store,
  commands: CommandBus,
  runtime: SessionRuntime,
  projects: ProjectBus,
  terminal: TerminalBridge,
): void => {
  const auth = workerBearerAuth(store)
  // Idempotent register (machineId-anchored). See store.workers.register
  // for the rule 1 / 2a / 2b / 2c algorithm.
  app.post('/workers', async c => {
    const body = (await c.req.json()) as {
      projectId?: Id
      agentKind?: string
      machineId?: string
      name?: string
      hostname?: string
    }
    if (!body.projectId || !body.machineId || !body.name || !body.hostname)
      return c.json({ error: 'projectId, machineId, name, hostname required' }, 400)
    // Register is gated now (removed from the cookie-gate exempt list): the caller
    // must be a member of the project's workspace (personal token / cookie). A worker
    // token re-registering is allowed (domain-scope exempts workers); dev (no users) open.
    const denied = await assertProjectAccess(c, store, body.projectId)
    if (denied) return denied
    const agentKind = parseAgentKind(body.agentKind)
    if (!agentKind) return c.json({ error: 'agentKind must be claude-code or codex' }, 400)
    const out = await store.workers.register({
      projectId: body.projectId,
      agentKind,
      machineId: body.machineId,
      name: body.name,
      hostname: body.hostname,
    })
    if (out.kind === 'name-collision') {
      return c.json(
        {
          error: `name "${body.name}" already in use by a different machine in this project`,
          hint: 'use --name to choose a different display name',
          existing: {
            id: out.existing.id,
            name: out.existing.name,
            hostname: out.existing.hostname,
          },
        },
        409,
      )
    }
    projects.publish(out.worker.projectId, { resource: 'workers' })
    // apiToken returned on every successful (re)register so the daemon can
    // re-read it after losing local state.
    return c.json(
      {
        // connected=false here: the daemon registers first, then opens its
        // command stream — subsequent reads flip it true.
        worker: workerWithView(out.worker, commands.has(out.worker.id)),
        apiToken: out.apiToken,
        outcome: out.kind,
      },
      201,
    )
  })

  // Worker command stream (worker-bearer). The persistent worker daemon
  // subscribes here and receives session.start / session.stop / session.delete
  // commands. Live-only — no replay. On disconnect, all of this worker's
  // sessions flip inactive immediately (its child processes died with it).
  app.get('/workers/me/stream', auth, c => {
    const worker = c.get('worker')
    // Daemon online: presence changed → refetch workers.
    projects.publish(worker.projectId, { resource: 'workers' })
    return streamBus(c, push => commands.subscribe(worker.id, push), {
      onClose: () => {
        // Daemon offline: its sessions flip inactive (forgetWorker), its interactive
        // terminals died with it (terminal.forgetWorker), and its presence drops —
        // refetch both.
        runtime.forgetWorker(worker.id)
        terminal.forgetWorker(worker.id)
        projects.publish(worker.projectId, { resource: 'workers' })
        projects.publish(worker.projectId, { resource: 'sessions' })
      },
    })
  })

  app.get('/workers/:id', async c => {
    const id = intParam(c.req.param('id'))
    const w = await store.workers.get(id)
    if (!w) return c.json({ error: 'not found' }, 404)
    const denied = await assertProjectAccess(c, store, w.projectId)
    if (denied) return denied
    return c.json(workerWithView(w, commands.has(w.id)))
  })

  // Heartbeat: the worker daemon's self-watchdog pings this and self-exits if it
  // can't reach the server. It only needs a 2xx and ignores the body — there's no
  // server-side liveness tracking anymore (`connected` = command-stream presence
  // is the single "is the worker usable" signal).
  app.post('/workers/heartbeat', async c => {
    const body = (await c.req.json()) as { machineId?: string }
    if (!body.machineId) return c.json({ error: 'machineId required' }, 400)
    return c.json({ ok: true })
  })

  // DELETE worker. Cascades to Session + SessionEvent (FK Cascade). The CLI
  // gates this behind --confirm; the server just executes.
  app.delete('/workers/:id', async c => {
    const id = intParam(c.req.param('id'))
    const w = await store.workers.get(id)
    if (!w) return c.json({ error: 'not found' }, 404)
    const denied = await assertProjectAccess(c, store, w.projectId)
    if (denied) return denied
    await store.workers.destroy(id)
    projects.publish(w.projectId, { resource: 'workers' })
    projects.publish(w.projectId, { resource: 'sessions' })
    return c.body(null, 204)
  })
}
