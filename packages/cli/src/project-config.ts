import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import type { Id } from '@baton/shared'

// Per-project shared config: lives in the repo root as .baton.json so the
// whole team picks up the same defaults via git. CLI walks up from cwd to
// find it (the same algorithm git uses for .git/).
//
// Private state (worker tokens, machine-id, session tokens) stays in
// ~/.config/baton/ and ~/.local/share/baton/ — never in the repo.
export const PROJECT_CONFIG_NAME = '.baton.json'

export type ProjectConfig = {
  server?: string
  workspace?: Id
  project?: Id
  name?: string
}

export type FoundConfig = { path: string; config: ProjectConfig }

// Walk up from `start` (default cwd) looking for .baton.json. Returns null
// at fs root or on malformed file.
export const findProjectConfig = (start: string = process.cwd()): FoundConfig | null => {
  let dir = resolve(start)
  while (true) {
    const p = join(dir, PROJECT_CONFIG_NAME)
    if (existsSync(p)) {
      try {
        return { path: p, config: JSON.parse(readFileSync(p, 'utf8')) as ProjectConfig }
      } catch {
        return null
      }
    }
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

export const saveProjectConfig = (path: string, config: ProjectConfig): void => {
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
}
