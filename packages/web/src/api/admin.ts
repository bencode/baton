import type { AdminOverview } from '@baton/shared'
import { request, type Url } from './request'

export type AdminApi = {
  // Fleet-wide snapshot for the ops board (/ops). 403 for non-admins.
  overview(): Promise<AdminOverview>
}

export const adminApi = (u: Url): AdminApi => ({
  overview: () => request(u('/admin/overview'), { method: 'GET' }),
})
