import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import type { Artifact, Id } from '@baton/shared'
import type { Context, Hono } from 'hono'
import { nanoid } from 'nanoid'
import {
  ArtifactTooLargeError,
  type ArtifactFileStore,
  MAX_ARTIFACT_BYTES,
  sanitizeArtifactFilename,
} from '../artifacts.ts'
import { assertProjectAccess } from '../middleware/domain-scope.ts'
import type { Store, StoredArtifact } from '../store/types.ts'
import { type AppEnv, intParam } from '../views.ts'
import { fileContentDisposition } from './attachment-download.ts'

const publicBase = (c: Context<AppEnv>): string =>
  (process.env.BATON_WEB_BASE?.trim() || new URL(c.req.url).origin).replace(/\/$/, '')

const toView = (c: Context<AppEnv>, artifact: StoredArtifact): Artifact => {
  const url = `${publicBase(c)}/a/${artifact.key}`
  return {
    id: artifact.id,
    projectId: artifact.projectId,
    key: artifact.key,
    filename: artifact.filename,
    contentType: artifact.contentType,
    size: artifact.size,
    url,
    downloadUrl: `${url}?download=1`,
    createdAt: artifact.createdAt,
  }
}

const projectIdFromQuery = (c: Context<AppEnv>): Id | null => {
  const projectId = Number(c.req.query('projectId'))
  return Number.isInteger(projectId) && projectId > 0 ? projectId : null
}

const assertManagementAccess = async (
  c: Context<AppEnv>,
  store: Store,
  projectId: Id,
): Promise<Response | null> => {
  const workerId = c.get('workerId')
  if (workerId !== undefined) {
    const worker = await store.workers.get(workerId)
    return worker?.projectId === projectId ? null : c.json({ error: 'not found' }, 404)
  }
  return assertProjectAccess(c, store, projectId)
}

const normalizedContentType = (contentType: string): string =>
  contentType.split(';', 1)[0]?.trim().toLowerCase() || 'application/octet-stream'

const isInlineType = (contentType: string): boolean =>
  contentType === 'application/pdf' ||
  contentType === 'application/json' ||
  contentType === 'text/csv' ||
  contentType === 'text/markdown' ||
  contentType === 'text/plain' ||
  ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(contentType)

const htmlCsp = [
  'sandbox allow-scripts',
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'media-src data: blob:',
  'font-src data:',
  "connect-src 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
].join('; ')

export const registerArtifactPublicRoutes = (
  app: Hono<AppEnv>,
  store: Store,
  files: ArtifactFileStore,
): void => {
  app.get('/a/:key', async c => {
    const artifact = await store.artifacts.getByKey(c.req.param('key'))
    if (!artifact) return c.json({ error: 'not found' }, 404)
    const path = files.path(artifact.projectId, artifact.storageId)
    const present = await stat(path).catch(() => null)
    if (!present) return c.json({ error: 'not found' }, 404)

    const contentType = normalizedContentType(artifact.contentType)
    const forceDownload = c.req.query('download') === '1'
    const inline = !forceDownload && (contentType === 'text/html' || isInlineType(contentType))
    c.header('content-type', artifact.contentType)
    c.header('content-length', String(artifact.size))
    c.header('content-disposition', fileContentDisposition(artifact.filename, inline))
    c.header('x-content-type-options', 'nosniff')
    c.header('referrer-policy', 'no-referrer')
    c.header('cache-control', 'private, no-store')
    if (contentType === 'text/html') c.header('content-security-policy', htmlCsp)
    return c.body(Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>)
  })
}

export const registerArtifactRoutes = (
  app: Hono<AppEnv>,
  store: Store,
  files: ArtifactFileStore,
): void => {
  app.post('/artifacts', async c => {
    const projectId = projectIdFromQuery(c)
    if (!projectId) return c.json({ error: 'projectId required' }, 400)
    const denied = await assertManagementAccess(c, store, projectId)
    if (denied) return denied
    if (!(await store.projects.get(projectId))) return c.json({ error: 'not found' }, 404)
    const announcedSize = Number(c.req.header('content-length'))
    if (Number.isFinite(announcedSize) && announcedSize > MAX_ARTIFACT_BYTES)
      return c.json({ error: 'artifact exceeds 100 MB limit' }, 413)

    let stored: Awaited<ReturnType<ArtifactFileStore['put']>>
    try {
      stored = await files.put(projectId, c.req.raw.body)
    } catch (error) {
      if (error instanceof ArtifactTooLargeError)
        return c.json({ error: 'artifact exceeds 100 MB limit' }, 413)
      throw error
    }
    try {
      const artifact = await store.artifacts.create({
        projectId,
        key: nanoid(12),
        storageId: stored.storageId,
        filename: sanitizeArtifactFilename(c.req.query('filename') || 'file'),
        contentType: c.req.header('content-type') || 'application/octet-stream',
        size: stored.size,
      })
      return c.json(toView(c, artifact), 201)
    } catch (error) {
      await files.forget(projectId, stored.storageId)
      throw error
    }
  })

  app.get('/artifacts', async c => {
    const projectId = projectIdFromQuery(c)
    if (!projectId) return c.json({ error: 'projectId required' }, 400)
    const denied = await assertManagementAccess(c, store, projectId)
    if (denied) return denied
    if (!(await store.projects.get(projectId))) return c.json({ error: 'not found' }, 404)
    return c.json((await store.artifacts.listByProject(projectId)).map(a => toView(c, a)))
  })

  app.delete('/artifacts/:id', async c => {
    const artifact = await store.artifacts.get(intParam(c.req.param('id')))
    if (!artifact) return c.json({ error: 'not found' }, 404)
    const denied = await assertManagementAccess(c, store, artifact.projectId)
    if (denied) return denied
    await store.artifacts.delete(artifact.id)
    await files.forget(artifact.projectId, artifact.storageId)
    return c.body(null, 204)
  })
}
