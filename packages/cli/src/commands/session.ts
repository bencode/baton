import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Id, SessionMode } from '@baton/shared'
import { defineCommand } from 'citty'
import { type ApiClient, createClient, createWorkerClient } from '../client.ts'
import { resolveBaseUrl } from '../config.ts'
import { fmtSession, renderList, renderOne, toJson } from '../output.ts'
import { defaultConfigPath, loadConfig, type SessionConfig, saveConfig } from '../session/config.ts'
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
  resolvePath: (sessionCode: string) => string = defaultConfigPath,
): Promise<{ config: SessionConfig; path: string }> => {
  // We don't know S-N until POST returns — slug by name + UUID short for a unique tmp path.
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
    sessionCode: registered.code,
    projectId: input.projectId,
    name: input.name,
    mode: input.mode,
    claudeSessionId,
    worktreePath: provisional,
  }
  const path = resolvePath(registered.code)
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
        })
        console.log(`created ${config.sessionCode}  (${config.worktreePath})`)
        console.log(`  claudeSessionId: ${config.claudeSessionId}`)
        console.log(`  token saved to:  ${path}`)
      },
    }),
    say: defineCommand({
      meta: { name: 'say', description: 'send a chat message into a session' },
      args: {
        code: { type: 'positional', required: true, description: 'session code (S-N)' },
        text: { type: 'positional', required: true, description: 'message text' },
        project: { type: 'string', required: true, description: 'project id (int)' },
        ...common,
      },
      run: async ({ args }) => {
        const c = clientFor(args)
        const s = await c.sessions.getByCode(Number(args.project), args.code)
        const ev = await c.sessions.sendMessage(s.id, args.text)
        if (args.json) console.log(toJson(ev))
        else console.log(`sent (seq ${ev.sequence}) → ${s.code}: ${args.text}`)
      },
    }),
    close: defineCommand({
      meta: { name: 'close', description: 'close a session (optionally remove its worktree)' },
      args: {
        code: { type: 'positional', required: true, description: 'session code (S-N)' },
        project: { type: 'string', required: true, description: 'project id (int)' },
        'rm-worktree': { type: 'boolean', description: 'also remove the git worktree' },
        repo: { type: 'string', description: 'source repo path (required with --rm-worktree)' },
        config: {
          type: 'string',
          description: 'path to session config (default ~/.config/baton/session-S-N.json)',
        },
        ...common,
      },
      run: async ({ args }) => {
        const cliClient = clientFor(args)
        const s = await cliClient.sessions.getByCode(Number(args.project), args.code)
        const cfgPath = args.config ?? defaultConfigPath(s.code)
        const cfg = loadConfig(cfgPath)
        const w = createWorkerClient(cfg.server, cfg.apiToken)
        await w.close()
        if (args['rm-worktree']) {
          if (!args.repo) throw new Error('--repo is required together with --rm-worktree')
          removeWorktree(args.repo, cfg.worktreePath)
        }
        console.log(`closed ${s.code}`)
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
      meta: { name: 'get', description: 'get a session by code (S-N)' },
      args: {
        code: { type: 'positional', required: true },
        project: { type: 'string', required: true, description: 'project id (int)' },
        ...common,
      },
      run: async ({ args }) => {
        const c = clientFor(args)
        const s = await c.sessions.getByCode(Number(args.project), args.code)
        console.log(renderOne(s, fmtSession, Boolean(args.json)))
      },
    }),
  },
})
