import { randomUUID } from 'node:crypto'
import { hostname as osHostname } from 'node:os'
import { join } from 'node:path'
import type { Id, SessionMode } from '@baton/shared'
import { defineCommand } from 'citty'
import type { ApiClient } from '../../client.ts'
import { resolveBaseUrl } from '../../config.ts'
import { defaultConfigPath, type SessionConfig, saveConfig } from '../../session/config.ts'
import { createWorktree, removeWorktree } from '../../session/worktree.ts'
import { clientFor, common } from '../../util.ts'
import { loadWorkerConfigOrNull, workerConfigPath } from '../../worker/config.ts'
import { defaultWorktreeDir, slug } from './shared.ts'

export type SessionNewInput = {
  projectId: Id
  name: string
  repo: string
  base: string
  worktreeDir: string
  mode: SessionMode
  server: string
  // Snapshot fields filled when a local worker config exists.
  machineId?: string
  hostname?: string
  workerName?: string
}

type FsImpl = {
  createWorktree: typeof createWorktree
  removeWorktree: typeof removeWorktree
}

const buildConfig = (
  input: SessionNewInput,
  registered: { id: Id; apiToken: string },
  claudeSessionId: string,
  worktreePath: string,
): SessionConfig => ({
  server: input.server,
  apiToken: registered.apiToken,
  sessionId: registered.id,
  projectId: input.projectId,
  name: input.name,
  mode: input.mode,
  claudeSessionId,
  worktreePath,
  ...(input.machineId ? { machineId: input.machineId } : {}),
  ...(input.workerName ? { workerName: input.workerName } : {}),
})

// Provision a Session end-to-end: claudeSessionId UUID we generate, git worktree
// added off the source repo, then POST to baton with both. On worktree failure
// nothing is sent; on POST failure the worktree is rolled back.
export const newSession = async (
  client: ApiClient,
  input: SessionNewInput,
  fs: FsImpl = { createWorktree, removeWorktree },
  resolvePath: (sessionId: Id) => string = defaultConfigPath,
): Promise<{ config: SessionConfig; path: string }> => {
  const claudeSessionId = randomUUID()
  const provisional = join(input.worktreeDir, slug(`${input.name}-${claudeSessionId.slice(0, 8)}`))
  fs.createWorktree({
    repo: input.repo,
    worktreePath: provisional,
    sessionCode: claudeSessionId.slice(0, 8),
    base: input.base,
  })
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
  const config = buildConfig(input, registered, claudeSessionId, provisional)
  const path = resolvePath(registered.id)
  saveConfig(path, config)
  return { config, path }
}

export const sessionNewCommand = defineCommand({
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
    const projectId = Number(args.project)
    // Snapshot identity from the local worker config when one exists for
    // this project. Daemon will heartbeat /workers/heartbeat with this
    // machineId, so a missing worker config means alive will stay false
    // until the user runs `baton worker register`.
    const wc = loadWorkerConfigOrNull(workerConfigPath(projectId))
    const { config, path } = await newSession(c, {
      projectId,
      name: args.name,
      repo: args.repo,
      base: args.base ?? 'main',
      worktreeDir: args['worktree-dir'] ?? defaultWorktreeDir(),
      mode: (args.mode as SessionMode) ?? 'worker',
      server,
      hostname: osHostname(),
      ...(wc ? { machineId: wc.machineId, workerName: wc.name } : {}),
    })
    console.log(`created session #${config.sessionId} (${config.name})`)
    console.log(`  worktree:        ${config.worktreePath}`)
    console.log(`  claudeSessionId: ${config.claudeSessionId}`)
    if (wc) console.log(`  worker:          ${wc.name} (${wc.machineId.slice(0, 8)}…)`)
    else
      console.log(
        '  worker:          (none — run `baton worker register` so this session shows alive)',
      )
    console.log(`  token saved to:  ${path}`)
  },
})
