import type { Workspace } from '@baton/shared'
import { parseRoute, workspacePath } from '../../app/route'

// Persist the last meaningful location so a landing at `/` (fresh open, logo
// click, closeAll) restores where the user was, instead of always jumping to
// the first workspace. One full pathname covers workspace/project/item/session.
const KEY = 'baton.last-path'

export const saveLastPath = (path: string): void => {
  try {
    localStorage.setItem(KEY, path)
  } catch {
    /* storage unavailable (private mode, quota) — skip persistence */
  }
}

export const loadLastPath = (): string | null => {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

// Where a landing at `/` should go: prefer the saved path when it still points
// somewhere real; a bare workspace path is validated against the accessible
// list (project/session paths can't be cheaply checked here, so restore
// optimistically — a stale id just renders an empty view). Else first workspace.
export const resolveLandingPath = (
  saved: string | null,
  workspaces: Workspace[],
): string | null => {
  const first = workspaces[0]
  if (!first) return null
  if (saved) {
    const r = parseRoute(saved)
    const ok =
      r.kind === 'workspace' ? workspaces.some(w => w.id === r.workspaceId) : r.kind !== 'home'
    if (ok) return saved
  }
  return workspacePath(first.id)
}
