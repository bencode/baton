import { claudeBin } from './log.ts'
import type { SpawnImpl } from './spawn.ts'

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

// Spawn `claude --print "<title prompt>"` in the worktree, collect stdout, and
// return a sanitized title — or null when the exchange is too thin to title (no
// content, model declined with NONE, or empty output). Never throws.
export const generateTitle = async (input: {
  worktreePath: string
  userText: string
  assistantText: string
  spawnImpl: SpawnImpl
}): Promise<string | null> => {
  const { worktreePath, userText, assistantText, spawnImpl } = input
  // Nothing meaningful to summarize → decline without spawning claude.
  if (`${userText}${assistantText}`.trim().length < 4) return null
  const exchange = [
    `User: ${clip(userText, 800)}`,
    assistantText ? `Assistant: ${clip(assistantText, 800)}` : '',
  ]
    .filter(Boolean)
    .join('\n')
  const prompt = `Reply with ONLY a 2-5 word title (no quotes, no punctuation) summarizing this coding session. If it is too short or generic to title meaningfully, reply with exactly NONE:\n${exchange}`
  const out = await new Promise<string>(resolve => {
    let buf = ''
    let done = false
    const finish = (s: string): void => {
      if (!done) {
        done = true
        resolve(s)
      }
    }
    let child: ReturnType<SpawnImpl>
    try {
      child = spawnImpl(claudeBin(), ['--print', '--dangerously-skip-permissions', prompt], {
        cwd: worktreePath,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env,
      })
    } catch {
      return finish('')
    }
    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch {
        // already gone
      }
      finish('')
    }, TITLE_TIMEOUT_MS)
    child.stdout?.on('data', d => {
      buf += String(d)
    })
    child.on('exit', () => {
      clearTimeout(timer)
      finish(buf)
    })
    child.on('error', () => {
      clearTimeout(timer)
      finish('')
    })
  })
  const title = sanitizeTitle(out)
  return !title || isDeclined(title) ? null : title
}
