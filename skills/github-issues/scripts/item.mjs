#!/usr/bin/env node
// item.mjs — work-item sensor: lint / verify / close (ported from relay.py semantics).
//
// A ref is #12 | 12 | https://github.com/o/r/issues/12, read through gh. Labels
// and lifecycle follow the relay convention.
// lint   — body has ## Goal / ## Verification / ## Refs, with one ```bash block
//          immediately after the Verification heading (strict position: that is
//          what makes extraction deterministic).
// verify — lint, then run the bash block (set -e) in cwd. The block IS the
//          formal definition of "done"; agents never self-report completion.
// close  — lint → verify → only then: close the issue (completed) with the
//          verification output + cc the creator + state:needs-verification
//          label.
//
// Node ≥20, stdlib only. Requires gh (authed, repo cwd) on PATH.

import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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

export const issueSelector = ref => {
  if (/^#?\d+$/.test(ref)) return ref.replace('#', '')
  if (/^https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/\d+/.test(ref)) return ref
  throw new Error(`unrecognized ref "${ref}" (want #N or an issue url)`)
}

export const renderLint = r => {
  if (r.ok) return '✓ lint passed'
  const lines = ['✗ lint failed']
  if (r.missing.length)
    lines.push(`  missing sections: ${r.missing.map(s => `## ${s}`).join(', ')}`)
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

const ISSUE_FIELDS = 'number,body,author,assignees,labels,url'

const loadIssue = ref => JSON.parse(gh('issue', 'view', issueSelector(ref), '--json', ISSUE_FIELDS))

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
const lintAndVerify = issue => {
  const lint = lintBody(issue.body)
  if (!lint.ok) {
    console.error(renderLint(lint))
    return null
  }
  const result = runVerification(extractVerification(issue.body))
  console.log(renderVerify(result))
  return result.ok ? result : null
}

const closeIssue = (issue, output) => {
  ghTry('label', 'create', 'state:needs-verification', '--color', '1d76db')
  const author = issue.author?.login
  const assignees = (issue.assignees ?? []).map(a => a.login)
  const cc = author && !assignees.includes(author) ? `\n\ncc @${author} please verify` : ''
  const n = String(issue.number)
  const comment = `✓ Verification passed\n\n\`\`\`\n${output.trim() || '(no stdout)'}\n\`\`\`${cc}`
  gh('issue', 'close', n, '--reason', 'completed', '--comment', comment)
  ghTry('issue', 'edit', n, '--remove-label', 'state:in-progress')
  gh('issue', 'edit', n, '--add-label', 'state:needs-verification')
  console.log(`\n✓ closed: ${issue.url}${cc ? `\n  cc'd creator @${author} for acceptance` : ''}`)
}

const COMMANDS = {
  lint: ref => {
    const lint = lintBody(loadIssue(ref).body)
    console.log(renderLint(lint))
    return lint.ok ? 0 : 1
  },
  verify: ref => (lintAndVerify(loadIssue(ref)) ? 0 : 1),
  close: ref => {
    const issue = loadIssue(ref)
    const result = lintAndVerify(issue)
    if (!result) {
      console.error('\n✗ close aborted: the gate did not pass')
      return 1
    }
    closeIssue(issue, result.stdout)
    return 0
  },
}

// Run main only when invoked directly (the test file imports the pure functions).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, ref] = process.argv.slice(2)
  if (!COMMANDS[cmd] || !ref) {
    console.error('usage: item.mjs <lint|verify|close> <#N | issue-url>')
    process.exit(2)
  }
  try {
    process.exit(COMMANDS[cmd](ref))
  } catch (e) {
    console.error(`✗ ${e instanceof Error ? e.message : e}`)
    process.exit(1)
  }
}
