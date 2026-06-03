import type { QueryFn } from './query.ts'
import { claudeExecutable } from './sdk-env.ts'

// Auto-title a fresh session from its first exchange (user ask + assistant
// reply). We ask claude for a short title in a throwaway `--print` call (no
// session id, plain text out). When there isn't enough to title meaningfully we
// return null (decline) rather than inventing a junk name — the session keeps
// its `session-<id>` placeholder and the caller can retry on a later turn.

// Keep each side of the exchange bounded so the title prompt stays small.
const clip = (s: string, max: number): string => (s.length > max ? s.slice(0, max) : s)

// The model is told to reply with this sentinel when the exchange is too thin /
// generic to title — we treat that (or empty) as "no title yet".
const isDeclined = (title: string): boolean =>
  title.replace(/[^a-z]/gi, '').toUpperCase() === 'NONE'

// Trim model output down to a clean, short title: one line, no quotes/labels,
// capped. Exported for unit tests.
export const sanitizeTitle = (raw: string): string =>
  raw
    .replace(/[\r\n]+/g, ' ')
    .replace(/["'`]/g, '')
    .replace(/^\s*(title|session)\s*[:-]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
    .trim()

const TITLE_TIMEOUT_MS = 30_000

// Run a throwaway SDK query in the worktree (no session id — this isn't part of
// the conversation) and return its sanitized result as a title, or null when the
// exchange is too thin (no content, model declined with NONE, empty output).
// Never throws; an aborted timeout or SDK error yields ''.
export const generateTitle = async (input: {
  worktreePath: string
  userText: string
  assistantText: string
  queryFn: QueryFn
}): Promise<string | null> => {
  const { worktreePath, userText, assistantText, queryFn } = input
  // Nothing meaningful to summarize → decline without calling claude.
  if (`${userText}${assistantText}`.trim().length < 4) return null
  const exchange = [
    `User: ${clip(userText, 800)}`,
    assistantText ? `Assistant: ${clip(assistantText, 800)}` : '',
  ]
    .filter(Boolean)
    .join('\n')
  const prompt = `Reply with ONLY a 2-5 word title (no quotes, no punctuation) summarizing this coding session. If it is too short or generic to title meaningfully, reply with exactly NONE:\n${exchange}`
  const exe = claudeExecutable()
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), TITLE_TIMEOUT_MS)
  let out = ''
  try {
    const messages = queryFn({
      prompt,
      options: {
        cwd: worktreePath,
        permissionMode: 'bypassPermissions',
        allowedTools: [],
        includePartialMessages: false,
        abortController: abort,
        ...(exe ? { pathToClaudeCodeExecutable: exe } : {}),
      },
    })
    for await (const m of messages) {
      if (m.type === 'result' && typeof (m as { result?: unknown }).result === 'string')
        out = (m as { result: string }).result
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
  const title = sanitizeTitle(out)
  return !title || isDeclined(title) ? null : title
}
