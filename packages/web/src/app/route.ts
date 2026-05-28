// Path-based routing for the App shell. The active context lives in the URL:
// the project (workspace is derived from it) plus an optional open item, which
// is also the active tab. Pure functions — no react-router — so they unit-test.

export type Route =
  | { kind: 'home' }
  | { kind: 'workspace'; workspaceId: string }
  | { kind: 'project'; projectId: string }
  | { kind: 'requirement'; projectId: string; requirementId: string }
  | { kind: 'task'; projectId: string; taskId: string }

export const parseRoute = (pathname: string): Route => {
  const seg = pathname.split('/').filter(Boolean).map(decodeURIComponent)
  if (seg[0] === 'ws' && seg[1]) return { kind: 'workspace', workspaceId: seg[1] }
  if (seg[0] === 'proj' && seg[1]) {
    const projectId = seg[1]
    if (seg[2] === 'reqs' && seg[3])
      return { kind: 'requirement', projectId, requirementId: seg[3] }
    if (seg[2] === 'tasks' && seg[3]) return { kind: 'task', projectId, taskId: seg[3] }
    return { kind: 'project', projectId }
  }
  return { kind: 'home' }
}

const enc = encodeURIComponent
export const workspacePath = (workspaceId: string): string => `/ws/${enc(workspaceId)}`
export const projectPath = (projectId: string): string => `/proj/${enc(projectId)}`
export const requirementPath = (projectId: string, requirementId: string): string =>
  `/proj/${enc(projectId)}/reqs/${enc(requirementId)}`
export const taskPath = (projectId: string, taskId: string): string =>
  `/proj/${enc(projectId)}/tasks/${enc(taskId)}`

// Whether a path opens an item (and therefore becomes a tab).
export const isItemRoute = (pathname: string): boolean => {
  const kind = parseRoute(pathname).kind
  return kind === 'requirement' || kind === 'task'
}

// The active project for a path (drives the left tree), if any.
export const activeProjectId = (pathname: string): string | null => {
  const route = parseRoute(pathname)
  return 'projectId' in route ? route.projectId : null
}
