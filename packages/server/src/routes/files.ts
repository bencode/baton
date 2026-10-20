import {
  FILE_ERROR_STATUS,
  FILE_SEARCH_QUERY_MAX_LENGTH,
  type FileErrorCode,
  type FileQuery,
  type FileReply,
  type Id,
  isBranchName,
  normalizeFilePath,
} from '@baton/shared'
import type { Context, Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { FileRequests } from '../file-requests.ts'
import { workerBearerAuth } from '../middleware/auth.ts'
import { assertProjectAccess } from '../middleware/domain-scope.ts'
import type { Store } from '../store/types.ts'
import type { AppEnv } from '../views.ts'

type Ctx = Context<AppEnv>

// A 5 MiB text reply plus JSON escaping stays well under this.
const RESULT_BODY_LIMIT = 8 * 1024 * 1024

const positiveInt = (value: string): Id | null => {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : null
}

const fail = (c: Ctx, code: FileErrorCode, message: string): Response =>
  c.json({ error: message, code }, FILE_ERROR_STATUS[code])

const respond = (c: Ctx, reply: FileReply): Response =>
  reply.ok ? c.json(reply.data) : fail(c, reply.code, reply.message)

// The worker addressed by the URL, if the caller is a user who may read its
// project. Workers themselves have no reason to read files through the server.
const targetWorker = async (c: Ctx, store: Store): Promise<Id | Response> => {
  if (c.get('workerId') !== undefined)
    return c.json({ error: 'workers cannot read project files' }, 403)
  const workerId = positiveInt(c.req.param('workerId') ?? '')
  const worker = workerId ? await store.workers.get(workerId) : null
  if (!worker) return c.json({ error: 'not found' }, 404)
  return (await assertProjectAccess(c, store, worker.projectId)) ?? worker.id
}

const branchParam = (c: Ctx): string | null => {
  const branch = c.req.query('branch') ?? ''
  return isBranchName(branch) ? branch : null
}

export const registerFileRoutes = (app: Hono<AppEnv>, store: Store, files: FileRequests): void => {
  const base = '/workers/:workerId'

  // Shared tail of every user-facing read: resolve the worker, validate the query,
  // forward it, and map the reply to HTTP.
  const forward = async (c: Ctx, build: () => FileQuery | null): Promise<Response> => {
    const workerId = await targetWorker(c, store)
    if (workerId instanceof Response) return workerId
    const query = build()
    if (query === null) return fail(c, 'invalid_request', 'invalid file query')
    return respond(c, await files.query(workerId, query, c.req.raw.signal))
  }

  app.get(`${base}/branches`, c => forward(c, () => ({ op: 'branches' })))

  app.get(`${base}/list`, c =>
    forward(c, () => {
      const branch = branchParam(c)
      const path = normalizeFilePath(c.req.query('path') ?? '', true)
      return branch && path !== null ? { op: 'list', branch, path } : null
    }),
  )

  app.get(`${base}/search`, c =>
    forward(c, () => {
      const branch = branchParam(c)
      const query = (c.req.query('q') ?? '').trim()
      return branch && query && query.length <= FILE_SEARCH_QUERY_MAX_LENGTH
        ? { op: 'search', branch, query }
        : null
    }),
  )

  app.get(`${base}/view`, c =>
    forward(c, () => {
      const branch = branchParam(c)
      const path = normalizeFilePath(c.req.query('path') ?? '')
      return branch && path !== null ? { op: 'view', branch, path } : null
    }),
  )

  app.put(
    '/workers/me/files/results',
    bodyLimit({
      maxSize: RESULT_BODY_LIMIT,
      onError: c => c.json({ error: 'file result too large' }, 413),
    }),
    workerBearerAuth(store),
    async c => {
      const settled = files.settle(c.get('worker').id, await c.req.json())
      return settled ? c.json({ ok: true }) : c.json({ error: 'unknown request' }, 404)
    },
  )
}
