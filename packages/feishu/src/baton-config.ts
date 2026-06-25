import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// The bridge reuses the worker's own `.baton.json` (written by `baton worker
// register`) for the baton server URL, the (project, worker) route, and the auth
// token — so an operator just runs the bridge next to `baton worker run` with no
// extra wiring, acting as the worker. Resolution is cwd-only, or an explicit
// `--config <path>` flag / `BATON_CONFIG` env (matching the worker's own lookup).
// Every field is optional: env vars still override, so the central docker bridges
// (pure env, no .baton.json) keep working unchanged.
export type BatonBase = { server?: string; projectId?: number; workerId?: number; token?: string }

const configPath = (): string => {
  const i = process.argv.indexOf('--config')
  const flag = (i >= 0 ? process.argv[i + 1] : undefined) ?? process.env.BATON_CONFIG
  return flag ?? join(process.cwd(), '.baton.json')
}

export const readBatonConfig = (): BatonBase => {
  const path = configPath()
  if (!existsSync(path)) return {}
  try {
    const c = JSON.parse(readFileSync(path, 'utf8')) as {
      server?: string
      project?: number
      worker?: { id?: number; apiToken?: string }
    }
    return {
      server: c.server,
      projectId: c.project,
      workerId: c.worker?.id,
      token: c.worker?.apiToken,
    }
  } catch {
    return {} // malformed / unreadable → fall back to env entirely
  }
}
