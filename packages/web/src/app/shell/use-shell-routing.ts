import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../../api'
import { useProject, useProjects } from '../../features/projects/use-projects'
import { useSessions } from '../../features/sessions/use-sessions'
import {
  loadLastPath,
  resolveLandingPath,
  saveLastPath,
} from '../../features/workspaces/last-location'
import { useWorkspaces } from '../../features/workspaces/use-workspaces'
import { activeProjectId, parseRoute, projectPath, workspacePath } from '../route'
import type { Tab } from '../tabs/tabs-model'

type ShellRoutingArgs = {
  activeId: string
  cacheScope: string
  tabs: Tab[]
  retitle: (id: string, name: string) => void
}

type ShellRouting = { routeProjectId: number | null; workspaceId: number | null }

// Derives the project/workspace context from the active tab and runs the shell's
// navigation side effects: keep session tab titles synced to their live name,
// remember the last real location, and redirect the bare `/` and `/ws/:id`
// landings to a concrete project. Lifted out of Shell so the component keeps only
// composition + JSX; the active-tab state it reads is passed in (not owned here).
export const useShellRouting = ({
  activeId,
  cacheScope,
  tabs,
  retitle,
}: ShellRoutingArgs): ShellRouting => {
  const navigate = useNavigate()
  const route = parseRoute(activeId)
  const routeProjectId = activeProjectId(activeId)
  // Keep session tab labels in sync with the live (auto-titled/renamed) name.
  const { data: sessions } = useSessions(routeProjectId)
  useEffect(() => {
    if (!sessions) return
    for (const tab of tabs) {
      const r = parseRoute(tab.id)
      if (r.kind !== 'session' || r.projectId !== routeProjectId) continue
      const s = sessions.find(x => x.id === r.sessionId && x.projectId === routeProjectId)
      if (s && s.name !== tab.title) retitle(tab.id, s.name)
    }
  }, [sessions, tabs, retitle, routeProjectId])
  const routeWorkspaceId = route.kind === 'workspace' ? route.workspaceId : null
  const { data: project, error: projectError } = useProject(routeProjectId)
  const { data: workspaces } = useWorkspaces()
  const { data: wsProjects } = useProjects(routeWorkspaceId)
  const fallbackWorkspaceId = workspaces?.[0]?.id ?? null
  const routeWorkspaceAccessible =
    routeWorkspaceId !== null && workspaces?.some(workspace => workspace.id === routeWorkspaceId)
  const workspaceId =
    project?.id === routeProjectId
      ? project.workspaceId
      : routeWorkspaceAccessible
        ? routeWorkspaceId
        : fallbackWorkspaceId

  // Remember the last meaningful location so a later landing at `/` restores it.
  useEffect(() => {
    if (route.kind === 'home') return
    if (routeProjectId !== null && project?.id !== routeProjectId) return
    if (route.kind === 'workspace' && !routeWorkspaceAccessible) return
    saveLastPath(cacheScope, activeId)
  }, [activeId, cacheScope, project, route, routeProjectId, routeWorkspaceAccessible])

  // Home → restore the last visited path, else the first workspace.
  useEffect(() => {
    if (route.kind !== 'home' || !workspaces?.length) return
    const target = resolveLandingPath(loadLastPath(cacheScope), workspaces)
    if (target) navigate(target, { replace: true })
  }, [cacheScope, route.kind, workspaces, navigate])
  // A project outside the current user's scope, or a stale workspace URL, must
  // not strand the shell. Recover through the first accessible workspace; its
  // project list remains available while this redirect settles.
  useEffect(() => {
    const staleProject = projectError instanceof ApiError && projectError.status === 404
    const staleWorkspace =
      route.kind === 'workspace' && workspaces !== null && !routeWorkspaceAccessible
    if (!staleProject && !staleWorkspace) return
    navigate(fallbackWorkspaceId === null ? '/' : workspacePath(fallbackWorkspaceId), {
      replace: true,
    })
  }, [
    fallbackWorkspaceId,
    navigate,
    projectError,
    route.kind,
    routeWorkspaceAccessible,
    workspaces,
  ])
  // A bare workspace → its first project.
  useEffect(() => {
    const first = wsProjects?.[0]
    if (route.kind === 'workspace' && first?.workspaceId === routeWorkspaceId)
      navigate(projectPath(first.id), { replace: true })
  }, [route.kind, routeWorkspaceId, wsProjects, navigate])

  return { routeProjectId, workspaceId }
}
