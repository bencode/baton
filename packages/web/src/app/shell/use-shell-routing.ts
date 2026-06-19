import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProject, useProjects } from '../../features/projects/use-projects'
import { useSessions } from '../../features/sessions/use-sessions'
import {
  loadLastPath,
  resolveLandingPath,
  saveLastPath,
} from '../../features/workspaces/last-location'
import { useWorkspaces } from '../../features/workspaces/use-workspaces'
import { activeProjectId, parseRoute, projectPath } from '../route'
import type { Tab } from '../tabs/tabs-model'

type ShellRoutingArgs = {
  activeId: string
  tabs: Tab[]
  retitle: (id: string, name: string) => void
}

type ShellRouting = { routeProjectId: number | null; workspaceId: number | null }

// Derives the project/workspace context from the active tab and runs the shell's
// navigation side effects: keep session tab titles synced to their live name,
// remember the last real location, and redirect the bare `/` and `/ws/:id`
// landings to a concrete project. Lifted out of Shell so the component keeps only
// composition + JSX; the active-tab state it reads is passed in (not owned here).
export const useShellRouting = ({ activeId, tabs, retitle }: ShellRoutingArgs): ShellRouting => {
  const navigate = useNavigate()
  const route = parseRoute(activeId)
  const routeProjectId = activeProjectId(activeId)
  // Keep session tab labels in sync with the live (auto-titled/renamed) name.
  const { data: sessions } = useSessions(routeProjectId)
  useEffect(() => {
    if (!sessions) return
    for (const tab of tabs) {
      const r = parseRoute(tab.id)
      if (r.kind !== 'session') continue
      const s = sessions.find(x => x.id === r.sessionId)
      if (s && s.name !== tab.title) retitle(tab.id, s.name)
    }
  }, [sessions, tabs, retitle])
  const routeWorkspaceId = route.kind === 'workspace' ? route.workspaceId : null
  const { data: project } = useProject(routeProjectId)
  const { data: workspaces } = useWorkspaces()
  const { data: wsProjects } = useProjects(routeWorkspaceId)
  const workspaceId = project?.workspaceId ?? routeWorkspaceId

  // Remember the last meaningful location so a later landing at `/` restores it.
  useEffect(() => {
    if (route.kind !== 'home') saveLastPath(activeId)
  }, [route.kind, activeId])

  // Home → restore the last visited path, else the first workspace.
  useEffect(() => {
    if (route.kind !== 'home' || !workspaces?.length) return
    const target = resolveLandingPath(loadLastPath(), workspaces)
    if (target) navigate(target, { replace: true })
  }, [route.kind, workspaces, navigate])
  // A bare workspace → its first project.
  useEffect(() => {
    const first = wsProjects?.[0]
    if (route.kind === 'workspace' && first) navigate(projectPath(first.id), { replace: true })
  }, [route.kind, wsProjects, navigate])

  return { routeProjectId, workspaceId }
}
