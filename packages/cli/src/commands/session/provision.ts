import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { AgentKind, Id, SessionMode } from '@baton/shared'
import type { ApiClient } from '../../client.ts'
import {
  addSession,
  loadProjectConfig,
  projectConfigPath,
  type SessionConfig,
  viewSession,
} from '../../project-config.ts'
import { createWorktree, removeWorktree } from '../../session/worktree.ts'
import { slug } from './shared.ts'

// Provisioning helper for the top-level `baton start` command: create the
// agent session UUID + git worktree, POST to baton, save the local session
// config file. Returns the resolved SessionConfig + the config file path.
//
// No longer exposed as a CLI subcommand (`baton session new` was removed in
// M2.9 — `baton start --name X` is the single entry point). Kept as a pure
// module function so start.ts can compose it.

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

export const newSession = async (
  client: ApiClient,
  input: SessionNewInput,
  fs: FsImpl = { createWorktree, removeWorktree },
  cfgPath: string = projectConfigPath(),
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
  addSession(cfgPath, registered.id, {
    name: input.name,
    apiToken: registered.apiToken,
    mode: input.mode,
    agentKind: input.agentKind,
    agentSessionId,
    worktreePath: provisional,
  })
  const config = viewSession(loadProjectConfig(cfgPath), registered.id)
  return { config, path: cfgPath }
}
