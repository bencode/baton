import { defineCommand } from 'citty'
import { createClient, createWorkerClient } from '../../client.ts'
import type { SessionConfig } from '../../project-config.ts'
import { runDaemon } from '../../session/runner.ts'

// Internal entry spawned by the worker daemon (not meant to be run by hand).
// Credentials arrive via env (BATON_SERVER / BATON_WORKER_TOKEN /
// BATON_WORKER_MACHINE_ID); the session metadata comes from the server. Runs
// the per-session daemon loop (subscribe + drain + spawn claude per turn).
export const sessionRunCommand = defineCommand({
  meta: { name: 'run', description: 'run a session child (spawned by the worker daemon)' },
  args: {
    session: { type: 'positional', required: true, description: 'session int id' },
  },
  run: async ({ args }) => {
    const server = process.env.BATON_SERVER
    const workerToken = process.env.BATON_WORKER_TOKEN
    const machineId = process.env.BATON_WORKER_MACHINE_ID
    if (!server || !workerToken || !machineId)
      throw new Error('`session run` must be spawned by the worker daemon (missing BATON_* env)')
    const sessionId = Number(args.session)
    const client = createClient(server)
    const s = await client.sessions.get(sessionId)
    if (!s.agentSessionId || !s.worktreePath)
      throw new Error(`session #${sessionId} is not materialized yet`)
    const config: SessionConfig = {
      server,
      sessionId,
      projectId: s.projectId,
      workerId: s.workerId,
      name: s.name,
      mode: s.mode,
      agentKind: s.agentKind,
      agentSessionId: s.agentSessionId,
      worktreePath: s.worktreePath,
      workerMachineId: machineId,
      workerToken,
    }
    const worker = createWorkerClient(server, workerToken, sessionId)
    const ac = new AbortController()
    const stop = (): void => ac.abort()
    process.on('SIGINT', stop)
    process.on('SIGTERM', stop)
    await runDaemon(config, { client, worker }, ac.signal)
  },
})
