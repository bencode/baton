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
import { createFileQueryRunner, handleFileQuery } from './handler.ts'
import { discoverRoots } from './roots.ts'

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
  let rootId: string
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

  test('roots are the worker directory first, then other worktrees, with stable ids', async () => {
    const roots = data(await query({ op: 'roots' }), 'roots')
    assert.deepEqual(
      roots.map(({ path, kind, branch, current }) => ({ path, kind, branch, current })),
      [
        { path: repo, kind: 'worktree', branch: 'main', current: true },
        { path: worktree, kind: 'worktree', branch: 'feature', current: false },
      ],
    )
    assert.deepEqual(
      data(await query({ op: 'roots' }), 'roots').map(root => root.id),
      roots.map(root => root.id),
    )
    rootId = roots[0]?.id ?? ''
  })

  test('listing shows one level and hides protected, excluded, and escaping entries', async () => {
    const listing = data(await query({ op: 'list', rootId, path: '' }), 'list')
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
    const view = async (path: string) => query({ op: 'view', rootId, path })
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
      data(await query({ op: 'search', rootId, query: text }), 'search')
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

  test('a removed worktree stops resolving instead of falling back', async () => {
    const roots = data(await query({ op: 'roots' }), 'roots')
    const removedId = roots[1]?.id ?? ''
    git(repo, 'worktree', 'remove', '--force', worktree)
    const reply = await query({ op: 'list', rootId: removedId, path: '' })
    assert.equal(failure(reply), 'root_not_found')
  })

  test('a plain directory or a repository subdirectory exposes only itself', async () => {
    const plain = join(tmp, 'plain')
    mkdirSync(plain)
    assert.deepEqual(
      (await discoverRoots(plain)).map(({ path, kind, current }) => ({ path, kind, current })),
      [{ path: plain, kind: 'directory', current: true }],
    )
    assert.deepEqual(
      (await discoverRoots(join(repo, 'src'))).map(({ path, kind }) => ({ path, kind })),
      [{ path: join(repo, 'src'), kind: 'directory' }],
    )
  })

  test('the runner answers every query when more arrive than it runs at once', async () => {
    const run = createFileQueryRunner(repo, 1)
    const replies = await Promise.all([
      run({ op: 'roots' }),
      run({ op: 'roots' }),
      run({ op: 'roots' }),
    ])
    assert.deepEqual(
      replies.map(reply => reply.ok),
      [true, true, true],
    )
  })
})
