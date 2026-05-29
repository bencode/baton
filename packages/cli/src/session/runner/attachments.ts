import { createWriteStream } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { Attachment } from '@baton/shared'

// Fixed, conventional dir (relative to the worktree) where the Worker drops
// downloaded attachments. Referenced by name from the prompt so Claude reads
// them with the Read tool. Kept out of git via a generated .gitignore so the
// agent can't accidentally commit downloads.
export const ATTACH_DIR = 'attachments'

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

// Download every attachment into <worktree>/attachments/, streaming each to
// disk. Returns the relative paths (e.g. "attachments/foo.png") to cite in
// the prompt. All-or-nothing: any failed download throws, and the caller
// (runTurn) converts that into a turn_error so the user sees the failure
// instead of claude running with a partial file set.
export const materializeAttachments = async (opts: {
  worktreePath: string
  serverBase: string
  attachments: Attachment[]
  fetchImpl?: FetchImpl
}): Promise<string[]> => {
  const fetchImpl = opts.fetchImpl ?? fetch
  const dir = join(opts.worktreePath, ATTACH_DIR)
  await mkdir(dir, { recursive: true })
  // '*' ignores everything in this dir (including the .gitignore itself), so a
  // worktree's `git status` stays clean and Claude won't commit downloads.
  await writeFile(join(dir, '.gitignore'), '*\n', 'utf8')

  const taken = new Set<string>(['.gitignore'])
  const relPaths: string[] = []
  for (const att of opts.attachments) {
    const name = dedupe(att.filename, taken)
    const res = await fetchImpl(`${opts.serverBase}${att.url}`)
    if (!res.ok || !res.body) throw new Error(`attachment ${att.id} → ${res.status}`)
    await pipeline(Readable.fromWeb(res.body), createWriteStream(join(dir, name)))
    relPaths.push(`${ATTACH_DIR}/${name}`)
  }
  return relPaths
}

// Prepend a short header naming the downloaded files so Claude knows they're
// already on disk and where. Original text follows untouched.
export const augmentPrompt = (text: string, relPaths: string[]): string => {
  if (relPaths.length === 0) return text
  const header = [
    '[Attached files — already saved in the working directory:]',
    ...relPaths.map(p => `- ${p}`),
  ].join('\n')
  return text.length > 0 ? `${header}\n\n${text}` : header
}
