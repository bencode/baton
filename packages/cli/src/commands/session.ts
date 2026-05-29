import { randomUUID } from 'node:crypto'
import { homedir, hostname as osHostname } from 'node:os'
import { join } from 'node:path'
import type { Id, SessionMode } from '@baton/shared'
import { defineCommand } from 'citty'
import { type ApiClient, createWorkerClient } from '../client.ts'
import { resolveBaseUrl } from '../config.ts'
import { fmtSession, renderList, renderOne, toJson } from '../output.ts'
import { defaultConfigPath, loadConfig, type SessionConfig, saveConfig } from '../session/config.ts'
import { runDaemon } from '../session/runner.ts'
import { createWorktree, removeWorktree } from '../session/worktree.ts'
import { clientFor, common } from '../util.ts'

const defaultWorktreeDir = (env: NodeJS.ProcessEnv = process.env): string =>
  env.BATON_WORKTREE_DIR ??
  join(env.XDG_DATA_HOME ?? join(env.HOME ?? homedir(), '.local/share'), 'baton', 'worktrees')

// Slug a name for filesystem use (replace anything non-[a-z0-9-_] with -).
const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9_-]+/g, '-')

export type SessionNewInput = {
  projectId: Id
  name: string
  repo: string
  base: string
  worktreeDir: string
  mode: SessionMode
  server: string
  // Snapshot fields (optional in C1 — C2 wires up worker config + machine-id).
  machineId?: string
  hostname?: string
  workerName?: string
}

// Parse `KEY=VAL` strings into a flat record. Accepts:
//   - undefined → undefined
//   - "KEY=VAL"
//   - "K1=V1,K2=V2"           (citty only keeps the last `--env`; CSV is the
//                              escape hatch for multi-var in a single flag)
//   - ["KEY=VAL", "K2=V2"]    (in case citty array-mode kicks in)
export const parseEnvPairs = (
  pairs: string | string[] | undefined,
): Record<string, string> | undefined => {
  if (pairs === undefined) return undefined
  const tokens = (Array.isArray(pairs) ? pairs : [pairs])
    .flatMap(p => p.split(','))
    .map(t => t.trim())
    .filter(Boolean)
  const out: Record<string, string> = {}
  for (const p of tokens) {
    const idx = p.indexOf('=')
    if (idx <= 0) throw new Error(`invalid --env "${p}" (expected KEY=VAL)`)
    out[p.slice(0, idx)] = p.slice(idx + 1)
  }
  return Object.keys(out).length === 0 ? undefined : out
}

// Resolve a session positional arg: tries int id first, then name lookup.
const resolveSession = async (
  client: ApiClient,
  projectId: Id,
  handle: string,
): Promise<{ id: Id; name: string }> => {
  const asInt = Number(handle)
  if (Number.isInteger(asInt) && asInt > 0) {
    const byId = await client.sessions.get(asInt).catch(() => null)
    if (byId) return { id: byId.id, name: byId.name }
  }
  const byName = await client.sessions.findByName(projectId, handle)
  if (byName) return { id: byName.id, name: byName.name }
  throw new Error(`session "${handle}" not found in project ${projectId}`)
}

// Provision a Session end-to-end: claudeSessionId UUID we generate, git worktree
// added off the source repo, then POST to baton with both. On worktree failure
// nothing is sent; on POST failure the worktree is rolled back.
export const newSession = async (
  client: ApiClient,
  input: SessionNewInput,
  // injectable for tests:
  fs: { createWorktree: typeof createWorktree; removeWorktree: typeof removeWorktree } = {
    createWorktree,
    removeWorktree,
  },
  resolvePath: (sessionId: Id) => string = defaultConfigPath,
): Promise<{ config: SessionConfig; path: string }> => {
  const claudeSessionId = randomUUID()
  const provisional = join(input.worktreeDir, slug(`${input.name}-${claudeSessionId.slice(0, 8)}`))

  // Step 1 (filesystem): create worktree at the provisional path.
  fs.createWorktree({
    repo: input.repo,
    worktreePath: provisional,
    sessionCode: claudeSessionId.slice(0, 8),
    base: input.base,
  })

  // Step 2 (server): register the session. If it fails, drop the worktree.
  const registered = await client.sessions
    .register({
      projectId: input.projectId,
      mode: input.mode,
      name: input.name,
      claudeSessionId,
      worktreePath: provisional,
      machineId: input.machineId,
      hostname: input.hostname,
      workerName: input.workerName,
    })
    .catch(err => {
      fs.removeWorktree(input.repo, provisional)
      throw err
    })

  // Step 3 (local config): persist the bearer token + identity.
  const config: SessionConfig = {
    server: input.server,
    apiToken: registered.apiToken,
    sessionId: registered.id,
    projectId: input.projectId,
    name: input.name,
    mode: input.mode,
    claudeSessionId,
    worktreePath: provisional,
  }
  const path = resolvePath(registered.id)
  saveConfig(path, config)
  return { config, path }
}

export const session = defineCommand({
  meta: { name: 'session', description: 'create / chat / inspect Claude Code sessions' },
  subCommands: {
    new: defineCommand({
      meta: { name: 'new', description: 'create a new session with its own git worktree' },
      args: {
        project: { type: 'string', required: true, description: 'project id (int)' },
        name: { type: 'string', required: true, description: 'human-friendly session name' },
        repo: { type: 'string', required: true, description: 'path to the source git repo' },
        base: { type: 'string', description: 'base branch / ref (default: main)' },
        'worktree-dir': { type: 'string', description: 'override worktree parent dir' },
        mode: { type: 'string', description: 'worker | skill (default worker)' },
        ...common,
      },
      run: async ({ args }) => {
        const server = resolveBaseUrl(args.url)
        const c = clientFor(args)
        const { config, path } = await newSession(c, {
          projectId: Number(args.project),
          name: args.name,
          repo: args.repo,
          base: args.base ?? 'main',
          worktreeDir: args['worktree-dir'] ?? defaultWorktreeDir(),
          mode: (args.mode as SessionMode) ?? 'worker',
          server,
          // Snapshot fields filled in C1 from local-only sources; C2 will
          // route them through worker config + machine-id file.
          hostname: osHostname(),
        })
        console.log(`created session #${config.sessionId} (${config.name})`)
        console.log(`  worktree:        ${config.worktreePath}`)
        console.log(`  claudeSessionId: ${config.claudeSessionId}`)
        console.log(`  token saved to:  ${path}`)
      },
    }),
    say: defineCommand({
      meta: { name: 'say', description: 'send a chat message into a session (by int id or name)' },
      args: {
        session: { type: 'positional', required: true, description: 'session int id or name' },
        text: { type: 'positional', required: true, description: 'message text' },
        project: { type: 'string', required: true, description: 'project id (int)' },
        ...common,
      },
      run: async ({ args }) => {
        const c = clientFor(args)
        const projectId = Number(args.project)
        const s = await resolveSession(c, projectId, args.session)
        const ev = await c.sessions.sendMessage(s.id, args.text)
        if (args.json) console.log(toJson(ev))
        else console.log(`sent (seq ${ev.sequence}) → ${s.name} (#${s.id}): ${args.text}`)
      },
    }),
    close: defineCommand({
      meta: { name: 'close', description: 'close a session (optionally remove its worktree)' },
      args: {
        session: { type: 'positional', required: true, description: 'session int id or name' },
        project: { type: 'string', required: true, description: 'project id (int)' },
        'rm-worktree': { type: 'boolean', description: 'also remove the git worktree' },
        repo: { type: 'string', description: 'source repo path (required with --rm-worktree)' },
        config: {
          type: 'string',
          description: 'path to session config (default ~/.config/baton/session-<id>.json)',
        },
        ...common,
      },
      run: async ({ args }) => {
        const cliClient = clientFor(args)
        const projectId = Number(args.project)
        const s = await resolveSession(cliClient, projectId, args.session)
        const cfgPath = args.config ?? defaultConfigPath(s.id)
        const cfg = loadConfig(cfgPath)
        const w = createWorkerClient(cfg.server, cfg.apiToken)
        await w.close()
        if (args['rm-worktree']) {
          if (!args.repo) throw new Error('--repo is required together with --rm-worktree')
          removeWorktree(args.repo, cfg.worktreePath)
        }
        console.log(`closed ${s.name} (#${s.id})`)
      },
    }),
    ls: defineCommand({
      meta: { name: 'ls', description: 'list sessions in a project' },
      args: {
        project: { type: 'string', required: true, description: 'project id (int)' },
        ...common,
      },
      run: async ({ args }) => {
        const c = clientFor(args)
        const ss = await c.sessions.listByProject(Number(args.project))
        console.log(renderList(ss, fmtSession, Boolean(args.json)))
      },
    }),
    get: defineCommand({
      meta: { name: 'get', description: 'get a session by int id or name' },
      args: {
        session: { type: 'positional', required: true, description: 'session int id or name' },
        project: { type: 'string', required: true, description: 'project id (int)' },
        ...common,
      },
      run: async ({ args }) => {
        const c = clientFor(args)
        const projectId = Number(args.project)
        const handle = await resolveSession(c, projectId, args.session)
        const s = await c.sessions.get(handle.id)
        console.log(renderOne(s, fmtSession, Boolean(args.json)))
      },
    }),
    run: defineCommand({
      meta: {
        name: 'run',
        description: 'subscribe to a session and run claude turns as messages arrive',
      },
      args: {
        session: { type: 'positional', required: true, description: 'session int id or name' },
        project: { type: 'string', required: true, description: 'project id (int)' },
        config: {
          type: 'string',
          description: 'override config path (default ~/.config/baton/session-<id>.json)',
        },
        env: {
          type: 'string',
          description: 'env injected into the spawned claude (KEY=VAL; CSV-multi or repeat flag)',
        },
        ...common,
      },
      run: async ({ args }) => {
        const cliClient = clientFor(args)
        const projectId = Number(args.project)
        const handle = await resolveSession(cliClient, projectId, args.session)
        const cfgPath = args.config ?? defaultConfigPath(handle.id)
        const cfg = loadConfig(cfgPath)
        const runEnv = parseEnvPairs(args.env as string | string[] | undefined)
        const worker = createWorkerClient(cfg.server, cfg.apiToken)
        const ac = new AbortController()
        const stop = () => ac.abort()
        process.on('SIGINT', stop)
        process.on('SIGTERM', stop)
        const tag = `#${cfg.sessionId} ${cfg.name}`
        console.log(`[${tag}] running (worktree: ${cfg.worktreePath})`)
        if (runEnv) console.log(`[${tag}] env keys: ${Object.keys(runEnv).join(', ')}`)
        await runDaemon(cfg, { client: cliClient, worker, env: runEnv }, ac.signal)
        console.log(`[${tag}] stopped`)
      },
    }),
  },
})
