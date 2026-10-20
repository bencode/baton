import {
  type FileBranch,
  type FileDirectory,
  type FileErrorCode,
  type FileSearchResult,
  type FileView,
  type Id,
  isFileErrorCode,
} from '@baton/shared'
import { ApiError, type Url } from './request'

// Files live on a Worker: one of its checked-out branches, then a path inside it.
export type FileScope = { workerId: Id; branch: string }

// Carries the server's file error code so the UI can tell an offline worker from a
// missing branch or a protected file.
export class FileApiError extends ApiError {
  constructor(
    message: string,
    status: number,
    readonly code: FileErrorCode | null,
  ) {
    super(message, status)
    this.name = 'FileApiError'
  }
}

export type FilesApi = {
  branches(workerId: Id, signal?: AbortSignal): Promise<FileBranch[]>
  list(scope: FileScope, path: string, signal?: AbortSignal): Promise<FileDirectory>
  search(scope: FileScope, query: string, signal?: AbortSignal): Promise<FileSearchResult>
  view(scope: FileScope, path: string, signal?: AbortSignal): Promise<FileView>
}

const readError = async (
  res: Response,
): Promise<{ message: string; code: FileErrorCode | null }> => {
  const text = await res.text()
  try {
    const body = JSON.parse(text) as { error?: unknown; code?: unknown }
    return {
      message: typeof body.error === 'string' ? body.error : text,
      code: isFileErrorCode(body.code) ? body.code : null,
    }
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
    return { message: text, code: null }
  }
}

const get = async <T>(url: string, signal?: AbortSignal): Promise<T> => {
  const res = await fetch(url, { credentials: 'same-origin', ...(signal ? { signal } : {}) })
  if (res.ok) return (await res.json()) as T
  const { message, code } = await readError(res)
  throw new FileApiError(`GET ${url} → ${res.status}: ${message}`, res.status, code)
}

export const filesApi = (u: Url): FilesApi => {
  const at = (workerId: Id, op: string, params: Record<string, string>) =>
    u(`/workers/${workerId}/${op}?${new URLSearchParams(params)}`)
  return {
    branches: (workerId, signal) => get(u(`/workers/${workerId}/branches`), signal),
    list: ({ workerId, branch }, path, signal) =>
      get(at(workerId, 'list', { branch, path }), signal),
    search: ({ workerId, branch }, query, signal) =>
      get(at(workerId, 'search', { branch, q: query }), signal),
    view: ({ workerId, branch }, path, signal) =>
      get(at(workerId, 'view', { branch, path }), signal),
  }
}
