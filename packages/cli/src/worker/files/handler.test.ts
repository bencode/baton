import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import type { FileQuery, FileQueryData, FileReply } from '@baton/shared'
import { discoverBranches } from './branches.ts'
import { createFileQueryRunner, handleFileQuery } from './handler.ts'

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', ['-C', cwd, '-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    encoding: 'utf8',
  })

const write = (path: string, content: string | Buffer): void => {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
}

const data = <Op extends FileQuery['op']>(reply: FileReply, _op: Op): FileQueryData[Op] => {
  if (!reply.ok) throw new Error(`${reply.code}: ${reply.message}`)
  return reply.data as FileQueryData[Op]
}

const failure = (reply: FileReply): string => (reply.ok ? 'ok' : reply.code)

describe('worker files — read-only queries on a real repository', () => {
  let tmp: string
  let repo: string
  let worktree: string
  let initialGitState: string[]
  const query = (q: FileQuery): Promise<FileReply> => handleFileQuery(repo, q)
  const gitState = (): string[] =>
    [repo, worktree].flatMap(dir => [
      git(dir, 'rev-parse', 'HEAD', '--abbrev-ref', 'HEAD'),
      git(dir, 'status', '--porcelain'),
    ])

  before(() => {
    tmp = realpathSync(mkdtempSync(join(tmpdir(), 'baton-files-')))
    repo = join(tmp, 'repo')
    worktree = join(tmp, 'wt')
    git(tmp, 'init', '-q', '-b', 'main', repo)
    write(join(repo, 'src/app.ts'), 'v1')
    git(repo, 'add', '.')
    git(repo, 'commit', '-q', '-m', 'init')
    git(repo, 'worktree', 'add', '-q', '-b', 'feature', worktree)
    git(repo, 'worktree', 'add', '-q', '--detach', join(tmp, 'detached'))
    write(join(repo, 'src/app.ts'), 'v2')
    write(join(repo, 'notes.md'), '# notes')
    write(join(repo, '.env'), 'SECRET=1')
    write(join(repo, '.env.example'), 'SECRET=')
    write(join(repo, '.baton.json'), '{"token":"x"}')
    write(join(repo, 'node_modules/pkg/index.js'), 'module.exports = 1')
    write(join(repo, 'binary.bin'), Buffer.from([1, 0, 2]))
    write(join(repo, 'big.txt'), '')
    truncateSync(join(repo, 'big.txt'), 5 * 1024 * 1024 + 1)
    write(join(tmp, 'outside.txt'), 'outside')
    symlinkSync(join(tmp, 'outside.txt'), join(repo, 'escape.txt'))
    symlinkSync('.env', join(repo, 'env-link'))
    Array.from({ length: 501 }, (_, index) => write(join(repo, `many/hit-${index}.txt`), ''))
    initialGitState = gitState()
  })
  after(() => rmSync(tmp, { recursive: true, force: true }))

  test('branches are the worker directory first, then other checked-out worktrees', async () => {
    assert.deepEqual(data(await query({ op: 'branches' }), 'branches'), [
      { name: 'main', path: repo, current: true },
      { name: 'feature', path: worktree, current: false },
    ])
  })

  test('a branch addresses its own worktree', async () => {
    const content = async (branch: string) => {
      const view = data(await query({ op: 'view', branch, path: 'src/app.ts' }), 'view')
      return view.kind === 'text' ? view.content : null
    }
    assert.equal(await content('main'), 'v2')
    assert.equal(await content('feature'), 'v1')
  })

  test('listing shows one level and hides protected, excluded, and escaping entries', async () => {
    const listing = data(await query({ op: 'list', branch: 'main', path: '' }), 'list')
    assert.deepEqual(
      listing.entries.map(entry => `${entry.kind}:${entry.name}`),
      [
        'directory:many',
        'directory:src',
        'file:.env.example',
        'file:big.txt',
        'file:binary.bin',
        'file:notes.md',
      ],
    )
    assert.equal(listing.truncated, false)
  })

  test('view returns current text and refuses protected, escaping, and oversized content', async () => {
    const view = async (path: string) => query({ op: 'view', branch: 'main', path })
    assert.deepEqual(data(await view('src/app.ts'), 'view'), {
      path: 'src/app.ts',
      name: 'app.ts',
      size: 2,
      kind: 'text',
      content: 'v2',
    })
    assert.equal(data(await view('binary.bin'), 'view').kind, 'binary')
    assert.deepEqual(data(await view('big.txt'), 'view'), {
      path: 'big.txt',
      name: 'big.txt',
      size: 5 * 1024 * 1024 + 1,
      kind: 'too_large',
      limit: 5 * 1024 * 1024,
    })
    assert.equal(failure(await view('.env')), 'forbidden_path')
    assert.equal(failure(await view('env-link')), 'file_not_found')
    assert.equal(failure(await view('escape.txt')), 'file_not_found')
    assert.equal(failure(await view('../outside.txt')), 'invalid_request')
    assert.equal(failure(await view('missing.txt')), 'file_not_found')
    assert.equal(failure(await view('src')), 'file_not_found')
  })

  test('search matches paths only within bounds', async () => {
    const search = async (text: string) =>
      data(await query({ op: 'search', branch: 'main', query: text }), 'search')
    const hits = await search('HIT-')
    assert.equal(hits.entries.length, 500)
    assert.equal(hits.truncated, true)
    assert.deepEqual(await search('env'), {
      entries: [{ name: '.env.example', path: '.env.example', kind: 'file' }],
      truncated: false,
    })
    assert.deepEqual((await search('index')).entries, [])
  })

  test('reads leave every worktree HEAD, branch, and status unchanged', () => {
    assert.deepEqual(gitState(), initialGitState)
  })

  test('a branch whose worktree is removed stops resolving instead of falling back', async () => {
    git(repo, 'worktree', 'remove', '--force', worktree)
    const reply = await query({ op: 'list', branch: 'feature', path: '' })
    assert.equal(failure(reply), 'branch_not_found')
  })

  test('only a work tree root exposes branches', async () => {
    const plain = join(tmp, 'plain')
    mkdirSync(plain)
    assert.deepEqual(await discoverBranches(plain), [])
    assert.deepEqual(await discoverBranches(join(repo, 'src')), [])
    assert.deepEqual(await discoverBranches(join(repo, '.git')), [])
  })

  test('the runner answers every query when more arrive than it runs at once', async () => {
    const run = createFileQueryRunner(repo, 1)
    const replies = await Promise.all([
      run({ op: 'branches' }),
      run({ op: 'branches' }),
      run({ op: 'branches' }),
    ])
    assert.deepEqual(
      replies.map(reply => reply.ok),
      [true, true, true],
    )
  })
})
