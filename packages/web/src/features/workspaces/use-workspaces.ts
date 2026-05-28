import type { Workspace } from '@baton/shared'
import { useApi } from '../../app/api-context.ts'
import { useAsync } from '../../hooks/use-async.ts'

export const useWorkspaces = () => {
  const api = useApi()
  return useAsync<Workspace[]>(() => api.workspaces.list(), 'workspaces')
}
