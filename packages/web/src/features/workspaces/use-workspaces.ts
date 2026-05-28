import type { Workspace } from '@baton/shared'
import { useApi } from '../../app/api-context'
import { useAsync } from '../../hooks/use-async'

export const useWorkspaces = () => {
  const api = useApi()
  return useAsync<Workspace[]>(() => api.workspaces.list(), 'workspaces')
}
