// Path-based routing for the App shell. The active context lives in the URL:
// the project (workspace is derived from it) plus an optional open item (also the active tab).
// Pure functions — no react-router — so they unit-test.

import type { Code } from '@baton/shared'

export type ItemKind = 'requirement' | 'task' | 'session'

export type Route =
  | { kind: 'home' }
  | { kind: 'workspace'; workspaceId: number }
  | { kind: 'project'; projectId: number }
  | { kind: 'item'; projectId: number; code: Code; itemKind: ItemKind }

const kindFromCode = (code: string): ItemKind | null => {
  if (code.startsWith('R-')) return 'requirement'
  if (code.startsWith('T-')) return 'task'
  if (code.startsWith('S-')) return 'session'
  return null
}

const intSeg = (s: string | undefined): number | null => {
  if (!s) return null
  const n = Number(s)
  return Number.isInteger(n) && n > 0 ? n : null
}

export const parseRoute = (pathname: string): Route => {
  const seg = pathname.split('/').filter(Boolean).map(decodeURIComponent)
  if (seg[0] === 'ws') {
    const id = intSeg(seg[1])
    if (id !== null) return { kind: 'workspace', workspaceId: id }
  }
  if (seg[0] === 'proj') {
    const projectId = intSeg(seg[1])
    if (projectId === null) return { kind: 'home' }
    const codeSeg = seg[2]
    if (codeSeg) {
      const itemKind = kindFromCode(codeSeg)
      if (itemKind) return { kind: 'item', projectId, code: codeSeg, itemKind }
    }
    return { kind: 'project', projectId }
  }
  return { kind: 'home' }
}

const enc = encodeURIComponent
export const workspacePath = (workspaceId: number): string => `/ws/${workspaceId}`
export const projectPath = (projectId: number): string => `/proj/${projectId}`
export const itemPath = (projectId: number, code: Code): string => `/proj/${projectId}/${enc(code)}`

// Whether a path opens an item (and therefore becomes a tab).
export const isItemRoute = (pathname: string): boolean => parseRoute(pathname).kind === 'item'

// The active project for a path (drives the left tree), if any.
export const activeProjectId = (pathname: string): number | null => {
  const route = parseRoute(pathname)
  return 'projectId' in route ? route.projectId : null
}
