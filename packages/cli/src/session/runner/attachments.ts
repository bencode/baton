import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { Attachment } from '@baton/shared'

export type FetchImpl = typeof fetch

// Avoid clobbering: foo.png, foo-1.png, foo-2.png, ...
const dedupe = (name: string, taken: Set<string>): string => {
  if (!taken.has(name)) {
    taken.add(name)
    return name
  }
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  let n = 1
  let candidate = `${stem}-${n}${ext}`
  while (taken.has(candidate)) {
    n += 1
    candidate = `${stem}-${n}${ext}`
  }
  taken.add(candidate)
  return candidate
}

// A failed download aborts the turn before invoking the Agent.
export const materializeAttachments = async (opts: {
  directory: string
  serverBase: string
  attachments: Attachment[]
  fetchImpl?: FetchImpl
}): Promise<string[]> => {
  const fetchImpl = opts.fetchImpl ?? fetch
  const dir = opts.directory
  await mkdir(dir, { recursive: true })
  const taken = new Set<string>()
  const paths: string[] = []
  for (const att of opts.attachments) {
    const name = dedupe(att.filename, taken)
    const res = await fetchImpl(`${opts.serverBase}${att.url}`)
    if (!res.ok || !res.body) throw new Error(`attachment ${att.id} → ${res.status}`)
    await pipeline(Readable.fromWeb(res.body), createWriteStream(join(dir, name)))
    paths.push(join(dir, name))
  }
  return paths
}

// Prepend a short header naming the downloaded files so Claude knows they're
// already on disk and where. Each line carries the same {label} the user sees in
// the composer (labels[i] aligns with paths[i]), so a "{image-1}" mention in
// the text resolves to a concrete path. Original text follows untouched.
export const augmentPrompt = (text: string, paths: string[], labels: string[]): string => {
  if (paths.length === 0) return text
  const header = [
    '[Attached files — already saved locally. Reference them by label:]',
    ...paths.map((p, i) => `- {${labels[i]}} ${p}`),
  ].join('\n')
  return text.length > 0 ? `${header}\n\n${text}` : header
}
