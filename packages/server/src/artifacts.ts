import { randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { Id } from '@baton/shared'

export const MAX_ARTIFACT_BYTES = 100 * 1024 * 1024

export class ArtifactTooLargeError extends Error {}

export type ArtifactFileStore = {
  put(
    projectId: Id,
    body: ReadableStream<Uint8Array> | null,
  ): Promise<{
    storageId: string
    size: number
  }>
  path(projectId: Id, storageId: string): string
  forget(projectId: Id, storageId: string): Promise<void>
  forgetProject(projectId: Id): Promise<void>
}

export const defaultArtifactDir = (env: NodeJS.ProcessEnv = process.env): string =>
  env.BATON_DATA_DIR
    ? join(env.BATON_DATA_DIR, 'artifacts')
    : join(env.XDG_DATA_HOME ?? join(env.HOME ?? homedir(), '.local/share'), 'baton', 'artifacts')

export const sanitizeArtifactFilename = (name: string): string => {
  const safe = Array.from(basename(name), character => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127 ? '_' : character
  })
    .join('')
    .replace(/[/\\]/g, '_')
    .trim()
  return safe || 'file'
}

const byteLimiter = (): Transform => {
  let size = 0
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.byteLength
      callback(size > MAX_ARTIFACT_BYTES ? new ArtifactTooLargeError() : null, chunk)
    },
  })
}

export const createArtifactFileStore = (rootDir: string): ArtifactFileStore => {
  const dirOf = (projectId: Id, storageId: string): string =>
    join(rootDir, String(projectId), storageId)
  const pathOf = (projectId: Id, storageId: string): string =>
    join(dirOf(projectId, storageId), 'blob')
  return {
    async put(projectId, body) {
      const storageId = randomUUID()
      const dir = dirOf(projectId, storageId)
      const path = pathOf(projectId, storageId)
      await mkdir(dir, { recursive: true })
      try {
        if (body) await pipeline(Readable.fromWeb(body), byteLimiter(), createWriteStream(path))
        else await writeFile(path, new Uint8Array())
        return { storageId, size: (await stat(path)).size }
      } catch (error) {
        await rm(dir, { recursive: true, force: true }).catch(() => {})
        throw error
      }
    },
    path: pathOf,
    async forget(projectId, storageId) {
      await rm(dirOf(projectId, storageId), { recursive: true, force: true }).catch(() => {})
    },
    async forgetProject(projectId) {
      await rm(join(rootDir, String(projectId)), { recursive: true, force: true }).catch(() => {})
    },
  }
}
