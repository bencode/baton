import type { SessionMode } from '@baton/shared'
import { defineCommand } from 'citty'
import { type ApiClient, createWorkerClient } from '../client.ts'
import { resolveBaseUrl } from '../config.ts'
import { clientFor, common, splitCsv } from '../util.ts'
import { type BackendName, resolveBackend } from '../worker/backends.ts'
import { defaultConfigPath, loadConfig, saveConfig, type WorkerConfig } from '../worker/config.ts'
import { runLoop } from '../worker/runner.ts'

// Register against the server, persist the issued token + identity, return the saved path.
export const registerWorker = async (
  client: ApiClient,
  server: string,
  input: { projectId: number; name: string; mode: SessionMode; capabilities?: string[] },
  resolvePath: (sessionCode: string) => string = defaultConfigPath,
): Promise<{ config: WorkerConfig; path: string }> => {
  const s = await client.sessions.register(input)
  const config: WorkerConfig = {
    server,
    apiToken: s.apiToken,
    sessionId: s.id,
    sessionCode: s.code,
    projectId: input.projectId,
    name: input.name,
    mode: input.mode,
    capabilities: input.capabilities ?? [],
  }
  const path = resolvePath(s.code)
  saveConfig(path, config)
  return { config, path }
}

export const worker = defineCommand({
  meta: { name: 'worker', description: 'register and run a worker (claim → execute → report)' },
  subCommands: {
    register: defineCommand({
      meta: {
        name: 'register',
        description: 'register a worker session and store its token locally',
      },
      args: {
        project: { type: 'string', required: true, description: 'project id (int)' },
        name: { type: 'string', required: true, description: 'human-friendly worker name' },
        capabilities: {
          type: 'string',
          description: 'comma-separated capability tags (e.g. node,claude)',
        },
        mode: { type: 'string', description: 'worker | skill (default worker)' },
        ...common,
      },
      run: async ({ args }) => {
        const server = resolveBaseUrl(args.url)
        const c = clientFor(args)
        const { config, path } = await registerWorker(c, server, {
          projectId: Number(args.project),
          name: args.name,
          mode: (args.mode as SessionMode) ?? 'worker',
          capabilities: splitCsv(args.capabilities),
        })
        console.log(`registered ${config.sessionCode} (token saved to ${path})`)
      },
    }),
    run: defineCommand({
      meta: { name: 'run', description: 'run the claim → execute → report loop' },
      args: {
        config: {
          type: 'string',
          description: 'path to worker config (default ~/.config/baton/worker-S-N.json)',
        },
        session: {
          type: 'string',
          description: 'session code (S-N) to derive default config path',
        },
        backend: { type: 'string', description: 'echo | claude (default echo)' },
        cwd: {
          type: 'string',
          description: 'working directory for the claude backend (default cwd)',
        },
        'poll-interval': { type: 'string', description: 'ms between claim polls (default 3000)' },
      },
      run: async ({ args }) => {
        const path = args.config ?? (args.session ? defaultConfigPath(args.session) : undefined)
        if (!path) throw new Error('--config or --session required to locate worker config')
        const config = loadConfig(path)
        const client = createWorkerClient(config.server, config.apiToken)
        const backendName = (args.backend as BackendName) ?? 'echo'
        const backend = resolveBackend(backendName, args.cwd ?? process.cwd())
        const pollIntervalMs = Number(args['poll-interval'] ?? 3000)
        console.log(
          `[${config.sessionCode}] running (backend=${backendName}, poll=${pollIntervalMs}ms)`,
        )
        let running = true
        const stop = () => {
          running = false
        }
        process.on('SIGINT', stop)
        process.on('SIGTERM', stop)
        await runLoop(client, backend, {
          pollIntervalMs,
          heartbeatMs: 30_000,
          shouldContinue: () => running,
          log: msg => console.log(`[${config.sessionCode}] ${msg}`),
        })
        await client.close().catch(() => {})
        console.log(`[${config.sessionCode}] stopped`)
      },
    }),
  },
})
