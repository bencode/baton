import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { AgentKind, Id, SessionMode } from '@baton/shared'
import { defineCommand } from 'citty'
import type { ApiClient } from '../../client.ts'
import { resolveBaseUrl } from '../../config.ts'
import { defaultConfigPath, type SessionConfig, saveConfig } from '../../session/config.ts'
import { createWorktree, removeWorktree } from '../../session/worktree.ts'
import { clientFor, common, resolveProjectId } from '../../util.ts'
import { loadWorkerConfigOrNull, workerConfigPath } from '../../worker/config.ts'
import { defaultWorktreeDir, slug } from './shared.ts'

export type SessionNewInput = {
  projectId: Id
  workerId: Id
  workerName: string
  workerMachineId: string
  name: string
  repo: string
  base: string
  worktreeDir: string
  mode: SessionMode
  agentKind: AgentKind
  server: string
}

type FsImpl = {
  createWorktree: typeof createWorktree
  removeWorktree: typeof removeWorktree
}

const buildConfig = (
  input: SessionNewInput,
  registered: { id: Id; apiToken: string },
  agentSessionId: string,
  worktreePath: string,
): SessionConfig => ({
  server: input.server,
  apiToken: registered.apiToken,
  sessionId: registered.id,
  projectId: input.projectId,
  workerId: input.workerId,
  name: input.name,
  mode: input.mode,
  agentKind: input.agentKind,
  agentSessionId,
  worktreePath,
  workerMachineId: input.workerMachineId,
})

// Provision a Session end-to-end: agent session UUID + git worktree + POST to
// baton. On worktree failure nothing is sent; on POST failure the worktree is
// rolled back.
export const newSession = async (
  client: ApiClient,
  input: SessionNewInput,
  fs: FsImpl = { createWorktree, removeWorktree },
  resolvePath: (sessionId: Id) => string = defaultConfigPath,
): Promise<{ config: SessionConfig; path: string }> => {
  const agentSessionId = randomUUID()
  const provisional = join(input.worktreeDir, slug(`${input.name}-${agentSessionId.slice(0, 8)}`))
  fs.createWorktree({
    repo: input.repo,
    worktreePath: provisional,
    sessionCode: agentSessionId.slice(0, 8),
    base: input.base,
  })
  const registered = await client.sessions
    .register({
      projectId: input.projectId,
      workerId: input.workerId,
      mode: input.mode,
      name: input.name,
      agentKind: input.agentKind,
      agentSessionId,
      worktreePath: provisional,
    })
    .catch(err => {
      fs.removeWorktree(input.repo, provisional)
      throw err
    })
  const config = buildConfig(input, registered, agentSessionId, provisional)
  const path = resolvePath(registered.id)
  saveConfig(path, config)
  return { config, path }
}

export const sessionNewCommand = defineCommand({
  meta: { name: 'new', description: 'create a new session with its own git worktree' },
  args: {
    project: { type: 'string', description: 'project id (overrides .baton.json)' },
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
    const projectId = resolveProjectId(args)
    // Session must be hosted by a registered worker on this machine — no worker
    // config, no session. The session's agent state file (claude-code's
    // ~/.claude/projects/<agentSessionId>.jsonl) is physically pinned to this
    // worker, so we refuse to register an orphan.
    const wc = loadWorkerConfigOrNull(workerConfigPath(projectId))
    if (!wc)
      throw new Error(
        `no worker registered for project ${projectId} on this machine. ` +
          'run `baton worker register --project ' +
          projectId +
          '` first.',
      )
    const { config, path } = await newSession(c, {
      projectId,
      workerId: wc.workerId,
      workerName: wc.name,
      workerMachineId: wc.machineId,
      name: args.name,
      repo: args.repo,
      base: args.base ?? 'main',
      worktreeDir: args['worktree-dir'] ?? defaultWorktreeDir(),
      mode: (args.mode as SessionMode) ?? 'worker',
      agentKind: 'claude-code',
      server,
    })
    console.log(`created session #${config.sessionId} (${config.name})`)
    console.log(`  worker:          ${wc.name} (#${wc.workerId})`)
    console.log(`  agent:           ${config.agentKind}  session ${config.agentSessionId}`)
    console.log(`  worktree:        ${config.worktreePath}`)
    console.log(`  token saved to:  ${path}`)
  },
})
