import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import type { Attachment } from '@baton/shared'
import type { Context } from 'hono'
import type { AppEnv } from '../views.ts'

// RFC 5987 ext-value: encodeURIComponent leaves ' ( ) * literal, but those are
// not attr-chars, so a strict parser can mis-read them (the apostrophe is the
// field delimiter). Percent-encode them too.
const rfc5987 = (s: string): string =>
  encodeURIComponent(s).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)

// HTTP header values are latin1 (ByteString) — a non-ASCII filename (e.g. a
// Chinese name) throws when set. ASCII-fold the legacy `filename=` fallback and
// carry the real UTF-8 name in RFC 5987 `filename*`.
const contentDisposition = (filename: string): string => {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'")
  return `inline; filename="${ascii}"; filename*=UTF-8''${rfc5987(filename)}`
}

// Stream a stored attachment back with download headers (content-type/length +
// a UTF-8-safe content-disposition). Shared by the session + channel attachment
// download routes; bytes stream straight from disk, never buffered.
export const sendAttachment = (
  c: Context<AppEnv>,
  found: { meta: Attachment; path: string },
): Response => {
  c.header('content-type', found.meta.contentType)
  c.header('content-length', String(found.meta.size))
  c.header('content-disposition', contentDisposition(found.meta.filename))
  return c.body(Readable.toWeb(createReadStream(found.path)) as ReadableStream<Uint8Array>)
}
