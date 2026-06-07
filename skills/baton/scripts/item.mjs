#!/usr/bin/env node
// item.mjs — work-item sensor: lint / verify / close (ported from relay.py semantics).
//
// One entry point for two independent tracks; the ref decides the source:
//   #12 | 12 | https://github.com/o/r/issues/12  → GitHub issue (via gh)
//   R-2 | T-3                                    → baton row (via baton CLI)
// The two tracks never cross — a baton row's body is its own; GitHub issues are
// their own. (GitHub-side labels/lifecycle follow the relay convention.)
// lint   — body has ## Goal / ## Verification / ## Refs, with one ```bash block
//          immediately after the Verification heading (strict position: that is
//          what makes extraction deterministic).
// verify — lint, then run the bash block (set -e) in cwd. The block IS the
//          formal definition of "done"; agents never self-report completion.
// close  — lint → verify → only then: close the issue (completed) with the
//          verification output + cc the creator + state:needs-verification
//          label; or, for a baton row, result comment + set-status done.
//
// Node ≥20, stdlib only. Requires gh (authed, repo cwd) and baton on PATH.

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const REQUIRED_SECTIONS = ['Goal', 'Verification', 'Refs']
// Strict by design: the bash block must immediately follow the heading (only
// blank lines between). Rigidity keeps verification deterministic and traceable.
const VERIFICATION_BLOCK = /^## Verification[ \t]*\n+```bash\n([\s\S]*?)\n```/m
const SECTION = /^## (\w+)/gm
// Diagnostics only: a bash block somewhere in the section but not in position.
const VERIFICATION_SECTION = /^## Verification[ \t]*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m
const ANY_BASH = /^```bash\n/m

export const lintBody = body => {
  const found = new Set([...body.matchAll(SECTION)].map(m => m[1]))
  const missing = REQUIRED_SECTIONS.filter(s => !found.has(s))
  const hasBlock = VERIFICATION_BLOCK.test(body)
  const section = body.match(VERIFICATION_SECTION)
  const misplaced =
    !hasBlock && !missing.includes('Verification') && Boolean(section && ANY_BASH.test(section[1]))
  return { ok: missing.length === 0 && hasBlock, missing, hasBlock, misplaced }
}

export const extractVerification = body => body.match(VERIFICATION_BLOCK)?.[1]

export const classifyRef = ref => {
  if (/^[RT]-\d+$/.test(ref)) return { kind: 'baton', code: ref }
  if (/^#?\d+$/.test(ref)) return { kind: 'issue', selector: ref.replace('#', '') }
  if (/^https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/\d+/.test(ref))
    return { kind: 'issue', selector: ref }
  throw new Error(`unrecognized ref "${ref}" (want #N, an issue url, R-N or T-N)`)
}

export const renderLint = r => {
  if (r.ok) return '✓ lint passed'
  const lines = ['✗ lint failed']
  if (r.missing.length) lines.push(`  missing sections: ${r.missing.map(s => `## ${s}`).join(', ')}`)
  if (!r.hasBlock && !r.missing.includes('Verification'))
    lines.push(
      r.misplaced
        ? '  ## Verification has a ```bash block, but text precedes it — move the block up (only blank lines between the heading and ```bash)'
        : '  ## Verification has no ```bash block',
    )
  return lines.join('\n')
}

const run = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8' })
const must = (cmd, args) => {
  const r = run(cmd, args)
  if (r.status !== 0) throw new Error(`${cmd} ${args[0]} failed: ${(r.stderr || r.stdout).trim()}`)
  return r.stdout
}
const gh = (...args) => must('gh', args)
const ghTry = (...args) => run('gh', args)
// BATON_BIN overrides for dev checkouts (e.g. "npx tsx packages/cli/src/index.ts").
const BATON = (process.env.BATON_BIN ?? 'baton').split(' ')
const baton = (...args) => must(BATON[0], [...BATON.slice(1), ...args])

const ISSUE_FIELDS = 'number,body,author,assignees,labels,url'

// Resolve a ref to { body, issue?, local? } — the spec lives in the row/issue
// itself; the two tracks never cross (a baton row uses its own body).
const loadItem = refStr => {
  const ref = classifyRef(refStr)
  if (ref.kind === 'issue') return issuePart(ref.selector)
  const kind = ref.code.startsWith('R-') ? 'requirement' : 'task'
  const item = JSON.parse(baton(kind, 'get', ref.code, '--json'))
  return { body: item.body ?? '', issue: null, local: { kind, code: ref.code } }
}
const issuePart = selector => {
  const issue = JSON.parse(gh('issue', 'view', selector, '--json', ISSUE_FIELDS))
  return { body: issue.body, issue }
}

const runVerification = block => {
  const dir = mkdtempSync(join(tmpdir(), 'baton-verify-'))
  const script = join(dir, 'verify.sh')
  writeFileSync(script, `set -e\n${block}\n`)
  try {
    const r = run('bash', [script])
    return { ok: r.status === 0, code: r.status ?? 1, stdout: r.stdout, stderr: r.stderr }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const renderVerify = r => {
  const lines = [r.ok ? '✓ verify passed' : `✗ verify failed (exit ${r.code})`]
  if (r.stdout.trim()) lines.push('--- stdout ---', r.stdout.trimEnd())
  if (r.stderr.trim()) lines.push('--- stderr ---', r.stderr.trimEnd())
  return lines.join('\n')
}

// Gate shared by verify and close: returns the verify result or null (gate
// already failed and printed why).
const lintAndVerify = it => {
  const lint = lintBody(it.body)
  if (!lint.ok) {
    console.error(renderLint(lint))
    return null
  }
  const result = runVerification(extractVerification(it.body))
  console.log(renderVerify(result))
  return result.ok ? result : null
}

const workerId = () => {
  try {
    return JSON.parse(readFileSync('.baton.json', 'utf8')).worker?.id
  } catch {
    return undefined
  }
}

const closeIssue = (it, output) => {
  ghTry('label', 'create', 'state:needs-verification', '--color', '1d76db')
  const author = it.issue.author?.login
  const assignees = (it.issue.assignees ?? []).map(a => a.login)
  const cc = author && !assignees.includes(author) ? `\n\ncc @${author} please verify` : ''
  const n = String(it.issue.number)
  const comment = `✓ Verification passed\n\n\`\`\`\n${output.trim() || '(no stdout)'}\n\`\`\`${cc}`
  gh('issue', 'close', n, '--reason', 'completed', '--comment', comment)
  ghTry('issue', 'edit', n, '--remove-label', 'state:in-progress')
  gh('issue', 'edit', n, '--add-label', 'state:needs-verification')
  console.log(`\n✓ closed: ${it.issue.url}${cc ? `\n  cc'd creator @${author} for acceptance` : ''}`)
}

const closeLocal = (it, output) => {
  const { kind, code } = it.local
  if (kind === 'task') {
    const wid = workerId()
    const body = `✓ Verification passed\n\n\`\`\`\n${output.trim() || '(no stdout)'}\n\`\`\``
    baton('task', 'comment', 'add', code, body, ...(wid ? ['--worker', String(wid)] : []))
  }
  baton(kind, 'set-status', code, 'done')
  console.log(`\n✓ ${code} → done (result comment recorded)`)
}

const COMMANDS = {
  lint: refStr => {
    const lint = lintBody(loadItem(refStr).body)
    console.log(renderLint(lint))
    return lint.ok ? 0 : 1
  },
  verify: refStr => (lintAndVerify(loadItem(refStr)) ? 0 : 1),
  close: refStr => {
    const it = loadItem(refStr)
    const result = lintAndVerify(it)
    if (!result) {
      console.error('\n✗ close aborted: the gate did not pass')
      return 1
    }
    if (it.issue) closeIssue(it, result.stdout)
    else closeLocal(it, result.stdout)
    return 0
  },
}

// Run main only when invoked directly (the test file imports the pure functions).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, ref] = process.argv.slice(2)
  if (!COMMANDS[cmd] || !ref) {
    console.error('usage: item.mjs <lint|verify|close> <#N | issue-url | R-N | T-N>')
    process.exit(2)
  }
  try {
    process.exit(COMMANDS[cmd](ref))
  } catch (e) {
    console.error(`✗ ${e instanceof Error ? e.message : e}`)
    process.exit(1)
  }
}
