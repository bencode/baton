import type { FileQueryResult } from '@baton/shared'
import { request } from './request.ts'

export type FilesClient = {
  report(result: FileQueryResult): Promise<{ ok: true }>
}

export const filesClient = (baseUrl: string): FilesClient => ({
  report: result => request(`${baseUrl}/workers/me/files/results`, { method: 'PUT', body: result }),
})
