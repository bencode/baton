import { claudeBin } from './log.ts'
import type { SpawnImpl } from './spawn.ts'

// Auto-title a fresh session from its first exchange (user ask + assistant
// reply). We ask claude for a short title in a throwaway `--print` call (no
// session id, plain text out), and fall back to a heuristic from the user
// message if that fails or returns junk.

// Keep each side of the exchange bounded so the title prompt stays small.
const clip = (s: string, max: number): string => (s.length > max ? s.slice(0, max) : s)

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

// First few words of the message — the no-LLM fallback.
export const heuristicTitle = (firstUserText: string): string => {
  const words = firstUserText.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).slice(0, 5)
  return (words.join(' ') || 'session').slice(0, 40)
}

const TITLE_TIMEOUT_MS = 30_000

// Spawn `claude --print "<title prompt>"` in the worktree, collect stdout, and
// return a sanitized title — or the heuristic fallback. Never throws.
export const generateTitle = async (input: {
  worktreePath: string
  userText: string
  assistantText: string
  spawnImpl: SpawnImpl
}): Promise<string> => {
  const { worktreePath, userText, assistantText, spawnImpl } = input
  const exchange = [
    `User: ${clip(userText, 800)}`,
    assistantText ? `Assistant: ${clip(assistantText, 800)}` : '',
  ]
    .filter(Boolean)
    .join('\n')
  const prompt = `Reply with ONLY a 2-5 word title (no quotes, no punctuation) summarizing this coding session:\n${exchange}`
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
  return sanitizeTitle(out) || heuristicTitle(userText)
}
