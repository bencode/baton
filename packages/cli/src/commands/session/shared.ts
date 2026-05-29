import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Id } from '@baton/shared'
import type { ApiClient } from '../../client.ts'

export const defaultWorktreeDir = (env: NodeJS.ProcessEnv = process.env): string =>
  env.BATON_WORKTREE_DIR ??
  join(env.XDG_DATA_HOME ?? join(env.HOME ?? homedir(), '.local/share'), 'baton', 'worktrees')

// Slug a name for filesystem use (replace anything non-[a-z0-9-_] with -).
export const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9_-]+/g, '-')

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
export const resolveSession = async (
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
