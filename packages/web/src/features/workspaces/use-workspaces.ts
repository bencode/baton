import type { Workspace } from '@baton/shared'
import { useApi } from '../../app/api-context'
import { useAsync } from '../../hooks/use-async'
import { useListRevision } from '../../hooks/use-list-revision'

export const useWorkspaces = () => {
  const api = useApi()
  const rev = useListRevision()
  return useAsync<Workspace[]>(() => api.workspaces.list(), `workspaces:${rev}`)
}
