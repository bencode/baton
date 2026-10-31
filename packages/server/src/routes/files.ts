import {
  branchFromPathSegment,
  FILE_DOWNLOAD_MAX_BYTES,
  FILE_ERROR_STATUS,
  FILE_SEARCH_QUERY_MAX_LENGTH,
  type FileErrorCode,
  type FileQuery,
  type FileQueryData,
  type FileReply,
  type Id,
  isBranchName,
  normalizeFilePath,
} from '@baton/shared'
import type { Context, Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { FileDownloads } from '../file-downloads.ts'
import type { FileRequests } from '../file-requests.ts'
import { workerBearerAuth } from '../middleware/auth.ts'
import { assertProjectAccess } from '../middleware/domain-scope.ts'
import type { Store } from '../store/types.ts'
import type { AppEnv } from '../views.ts'
import { fileContentDisposition } from './attachment-download.ts'

type Ctx = Context<AppEnv>

// A 5 MiB text reply plus JSON escaping stays well under this.
const RESULT_BODY_LIMIT = 8 * 1024 * 1024
const DOWNLOAD_FAILURE_BODY_LIMIT = 8 * 1024

const positiveInt = (value: string): Id | null => {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : null
}

type FileFailure = Extract<FileReply, { ok: false }>

const fail = (c: Ctx, code: FileErrorCode, message: string): Response =>
  c.json({ error: message, code }, FILE_ERROR_STATUS[code])

const respond = (c: Ctx, reply: FileReply): Response =>
  reply.ok ? c.json(reply.data) : fail(c, reply.code, reply.message)

// Raw bytes go out as the response body, never sniffed as another type; the
// sandbox CSP keeps an SVG or stylesheet opened directly from running scripts.
const RAW_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'private, no-store',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
}

// A download is opaque bytes saved under the file's own name, never rendered.
const DOWNLOAD_HEADERS = {
  'Content-Type': 'application/octet-stream',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'private, no-store',
  'Content-Security-Policy': "default-src 'none'; sandbox",
}

const isJson = (c: Ctx): boolean =>
  c.req.header('content-type')?.startsWith('application/json') ?? false

// A Content-Length of plain digits; anything else (absent, chunked, signed) is null.
const declaredLength = (value: string | undefined): number | null =>
  value !== undefined && /^\d{1,16}$/.test(value) ? Number(value) : null

const sendRaw = (c: Ctx, reply: FileReply): Response => {
  if (!reply.ok) return fail(c, reply.code, reply.message)
  const { mediaType, base64 } = reply.data as FileQueryData['raw']
  return c.body(new Uint8Array(Buffer.from(base64, 'base64')), 200, {
    ...RAW_HEADERS,
    'Content-Type': mediaType.startsWith('text/') ? `${mediaType}; charset=utf-8` : mediaType,
  })
}

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

export const registerFileRoutes = (
  app: Hono<AppEnv>,
  store: Store,
  files: FileRequests,
  downloads: FileDownloads,
): void => {
  const base = '/workers/:workerId'

  // Shared tail of every user-facing read: resolve the worker, validate the query,
  // forward it, and map the reply to HTTP.
  const forward = async (
    c: Ctx,
    build: () => FileQuery | null,
    send = respond,
  ): Promise<Response> => {
    const workerId = await targetWorker(c, store)
    if (workerId instanceof Response) return workerId
    const query = build()
    if (query === null) return fail(c, 'invalid_request', 'invalid file query')
    return send(c, await files.query(workerId, query, c.req.raw.signal))
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

  // Path-addressed, so URLs relative to a file resolve to its neighbours: a
  // previewed page's stylesheets and images, and the url()s inside those sheets.
  app.get(`${base}/raw/:branch/:path{.+}`, c =>
    forward(
      c,
      () => {
        const branch = branchFromPathSegment(c.req.param('branch'))
        const path = normalizeFilePath(c.req.param('path'))
        return isBranchName(branch) && path !== null ? { op: 'raw', branch, path } : null
      },
      sendRaw,
    ),
  )

  // Original bytes of any file within the download limit. Failures before the
  // headers go out are JSON like every other read; a failure after that ends the
  // body early, so the browser's download fails instead of saving a partial file.
  app.get(`${base}/download`, async c => {
    const workerId = await targetWorker(c, store)
    if (workerId instanceof Response) return workerId
    const branch = branchParam(c)
    const path = normalizeFilePath(c.req.query('path') ?? '')
    if (!branch || path === null) return fail(c, 'invalid_request', 'invalid file query')
    const reply = await downloads.request(workerId, { branch, path }, c.req.raw.signal)
    if (!reply.ok) return fail(c, reply.code, reply.message)
    return c.body(reply.data.body, 200, {
      ...DOWNLOAD_HEADERS,
      'Content-Length': String(reply.data.size),
      'Content-Disposition': fileContentDisposition(path.split('/').at(-1) ?? path, false),
    })
  })

  // The worker's side of a download: the bytes (octet-stream, exact Content-Length)
  // or why it cannot send them (small JSON). The upload is held open until every
  // byte has been forwarded to the browser.
  const failureLimit = bodyLimit({
    maxSize: DOWNLOAD_FAILURE_BODY_LIMIT,
    onError: c => c.json({ error: 'download failure report too large' }, 413),
  })
  app.put(
    '/workers/me/files/downloads/:requestId',
    workerBearerAuth(store),
    (c, next) => (isJson(c) ? failureLimit(c, next) : next()),
    async c => {
      const workerId = c.get('worker').id
      const requestId = c.req.param('requestId')
      const unknown = () => c.json({ error: 'unknown download' }, 404)
      if (isJson(c))
        return downloads.reject(workerId, requestId, await c.req.json())
          ? c.json({ ok: true })
          : unknown()
      const size = declaredLength(c.req.header('content-length'))
      if (size === null || size > FILE_DOWNLOAD_MAX_BYTES) {
        const tooLarge = size !== null
        const failure: FileFailure = tooLarge
          ? { ok: false, code: 'file_too_large', message: 'worker sent a file over the limit' }
          : { ok: false, code: 'unavailable', message: 'worker sent no valid length' }
        if (!downloads.reject(workerId, requestId, failure)) return unknown()
        return c.json({ error: failure.message }, tooLarge ? 413 : 400)
      }
      // An empty upload may arrive without a body stream.
      const body = c.req.raw.body ?? new Blob([]).stream()
      try {
        return (await downloads.receive(workerId, requestId, size, body, c.req.raw.signal))
          ? c.json({ ok: true })
          : unknown()
      } catch (error) {
        console.warn(`[files] download ${requestId} ended before completing`, error)
        return c.json({ error: 'download did not complete' }, 502)
      }
    },
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
