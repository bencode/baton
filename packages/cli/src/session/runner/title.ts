import { execFile as execFileCb } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { QueryFn } from './query.ts'
import { claudeExecutable } from './sdk-env.ts'

// Auto-title a fresh session from its first exchange (user ask + assistant
// reply). We ask claude for a short title in a throwaway `--print` call (no
// session id, plain text out). Outcomes are kept distinct so the daemon can
// log honestly: `declined` (exchange too thin / model said NONE — keep the
// `session-<id>` placeholder, retry later) vs `error` (the SDK call itself
// failed — timeout, proxy, auth — with the reason for the worker log).

export type TitleOutcome =
  | { kind: 'titled'; title: string }
  | { kind: 'declined' }
  | { kind: 'error'; reason: string }

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
    .replace(/[*_`~#>]/g, '') // markdown emphasis / heading / quote / code marks
    .replace(/["']/g, '')
    .replace(/^\s*(?:title|session|标题)\s*[:：-]\s*/i, '') // label prefix
    .replace(/^\s*(?:[-*•]|\d+[.)、])\s+/, '') // leading list marker
    .replace(/\s+/g, ' ')
    .trim()
    // When the model returns a sentence anyway, keep only the leading clause so
    // we get a noun phrase, not a mid-word `slice(0,30)` stub. CJK punctuation
    // never belongs in a title; ASCII .!?; only when sentence-final (so 1.2 and
    // file.ts survive).
    .replace(/(?:[。．！？，、；；]|[.!?;](?=\s|$)).*$/s, '')
    .trim()
    .slice(0, 30)
    .replace(/[\s。．，,、；;：:!！?？.]+$/, '') // trailing punctuation
    .trim()

// reclaude/proxy cold spawns routinely take >30s (config sync + TLS); a title
// is worthless if it costs a minute, but a too-tight timeout silently kills
// every attempt — 90s errs on the side of getting one.
const TITLE_TIMEOUT_MS = 90_000
const execFile = promisify(execFileCb)

const buildPrompt = (userText: string, assistantText: string): string => {
  const exchange = [
    `User: ${clip(userText, 800)}`,
    assistantText ? `Assistant: ${clip(assistantText, 800)}` : '',
  ]
    .filter(Boolean)
    .join('\n')
  return [
    'Name the TOPIC of this chat session — what it is ABOUT — as a short title:',
    'a noun phrase like a filename, at most 6 words or ~12 Chinese characters.',
    'Name the subject, do NOT restate the conclusion or the answer.',
    'No sentence, no punctuation at all (including Chinese ，。、；！？), no markdown,',
    'no quotes, and never an opener like "好的"/"收到"/"I\'ll".',
    '',
    'Examples (exchange → title):',
    'User asks whether the material-ui repo needs updating; assistant says it is',
    'already up to date → material-ui 仓库更新检查',
    'User: curl the health endpoint and report status → 健康检查接口排查',
    '',
    'Only if the exchange below has no real content at all (just a greeting or a',
    'test ping) reply with exactly NONE. Otherwise reply with ONLY the title.',
    '',
    exchange,
  ].join('\n')
}

type ExecFileFn = (
  file: string,
  args: readonly string[],
  options: { timeout: number; maxBuffer: number },
) => Promise<{ stdout: string | Buffer; stderr: string | Buffer }>

const codexExecutable = (): string => process.env.BATON_CODEX_EXECUTABLE ?? 'codex'

// Run a throwaway SDK query in the worktree (no session id — this isn't part
// of the conversation). Never throws; failures come back as `error` outcomes
// carrying the SDK error / result subtype / a stderr tail.
export const generateTitle = async (input: {
  worktreePath: string
  userText: string
  assistantText: string
  queryFn: QueryFn
}): Promise<TitleOutcome> => {
  const { worktreePath, userText, assistantText, queryFn } = input
  // Nothing meaningful to summarize → decline without calling claude.
  if (`${userText}${assistantText}`.trim().length < 4) return { kind: 'declined' }
  const exe = claudeExecutable()
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), TITLE_TIMEOUT_MS)
  const stderrTail: string[] = []
  let out = ''
  let resultSeen = false
  let failure = ''
  try {
    const messages = queryFn({
      prompt: buildPrompt(userText, assistantText),
      options: {
        cwd: worktreePath,
        // A one-shot summarizer, not an agent: replace the ~18k-token Claude
        // Code preset system prompt. Inside the agent harness the model
        // routinely answers NONE to this ask (verified against reclaude);
        // a plain summarizer persona titles reliably — and ~100× cheaper.
        systemPrompt: 'You title chat sessions.',
        // Don't load the worktree's CLAUDE.md / project settings — they steer the
        // model into verbose summaries instead of a terse title.
        settingSources: [],
        permissionMode: 'bypassPermissions',
        allowedTools: [],
        includePartialMessages: false,
        abortController: abort,
        stderr: line => {
          if (line.trim()) stderrTail.push(line.trim().slice(0, 200))
          if (stderrTail.length > 3) stderrTail.shift()
        },
        ...(exe ? { pathToClaudeCodeExecutable: exe } : {}),
      },
    })
    for await (const m of messages) {
      if (m.type !== 'result') continue
      resultSeen = true
      const r = m as { subtype?: string; result?: unknown }
      if (r.subtype === 'success' && typeof r.result === 'string') out = r.result
      else
        failure = `result ${r.subtype ?? 'unknown'}${typeof r.result === 'string' ? `: ${r.result.slice(0, 200)}` : ''}`
    }
  } catch (e) {
    failure = abort.signal.aborted
      ? `timeout after ${TITLE_TIMEOUT_MS / 1000}s`
      : String(e).slice(0, 300)
  } finally {
    clearTimeout(timer)
  }
  if (!failure && !resultSeen) failure = 'stream ended without a result message'
  if (failure) {
    const tail = stderrTail.length > 0 ? ` | stderr: ${stderrTail.join(' / ')}` : ''
    return { kind: 'error', reason: `${failure}${tail}` }
  }
  const title = sanitizeTitle(out)
  return !title || isDeclined(title) ? { kind: 'declined' } : { kind: 'titled', title }
}

export const generateTitleWithCodex = async (input: {
  worktreePath: string
  userText: string
  assistantText: string
  execFileFn?: ExecFileFn
}): Promise<TitleOutcome> => {
  const { worktreePath, userText, assistantText, execFileFn = execFile as ExecFileFn } = input
  if (`${userText}${assistantText}`.trim().length < 4) return { kind: 'declined' }
  const dir = await mkdtemp(join(tmpdir(), 'baton-title-'))
  const outPath = join(dir, 'title.txt')
  try {
    await execFileFn(
      codexExecutable(),
      [
        'exec',
        '--cd',
        worktreePath,
        '--sandbox',
        'read-only',
        '--ask-for-approval',
        'never',
        '--ephemeral',
        '--ignore-rules',
        '--color',
        'never',
        '--output-last-message',
        outPath,
        buildPrompt(userText, assistantText),
      ],
      {
        timeout: TITLE_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
      },
    )
    const title = sanitizeTitle(await readFile(outPath, 'utf8'))
    return !title || isDeclined(title) ? { kind: 'declined' } : { kind: 'titled', title }
  } catch (e) {
    const err = e as { message?: string; stderr?: string | Buffer }
    const stderr = err.stderr ? String(err.stderr).trim().slice(0, 300) : ''
    const reason = [err.message ?? String(e), stderr].filter(Boolean).join(' | stderr: ')
    return { kind: 'error', reason }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
