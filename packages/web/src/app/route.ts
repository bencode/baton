// Path-based routing for the App shell. The active context lives in the URL:
// the project (workspace is derived from it) plus an optional open item (also the active tab).
// Pure functions — no react-router — so they unit-test.

import type { Code } from '@baton/shared'

// Item kinds that travel as project-scoped codes in the URL.
// In M2.6 only R-/T- carry codes (chat-referenced resources). Session
// navigation uses its int id under /proj/<n>/session/<id>.
export type ItemKind = 'requirement' | 'task'

export type Route =
  | { kind: 'home' }
  | { kind: 'workspace'; workspaceId: number }
  | { kind: 'project'; projectId: number }
  | { kind: 'item'; projectId: number; code: Code; itemKind: ItemKind }
  | { kind: 'session'; projectId: number; sessionId: number }

const kindFromCode = (code: string): ItemKind | null => {
  if (code.startsWith('R-')) return 'requirement'
  if (code.startsWith('T-')) return 'task'
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
    // /proj/<p>/session/<sid>
    if (seg[2] === 'session') {
      const sessionId = intSeg(seg[3])
      if (sessionId !== null) return { kind: 'session', projectId, sessionId }
      return { kind: 'project', projectId }
    }
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
export const sessionPath = (projectId: number, sessionId: number): string =>
  `/proj/${projectId}/session/${sessionId}`

// Whether a path opens a tab (item or session).
export const isItemRoute = (pathname: string): boolean => {
  const r = parseRoute(pathname)
  return r.kind === 'item' || r.kind === 'session'
}

// The active project for a path (drives the left tree), if any.
export const activeProjectId = (pathname: string): number | null => {
  const route = parseRoute(pathname)
  return 'projectId' in route ? route.projectId : null
}
