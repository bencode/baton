import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'

export const ensureExcluded = (cwd: string, pattern: string): void => {
  const result = spawnSync('git', ['-C', cwd, 'rev-parse', '--git-path', 'info/exclude'], {
    encoding: 'utf8',
    env: { ...process.env, LC_ALL: 'C' },
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    if (result.stderr.includes('not a git repository')) return
    throw new Error(`cannot locate Git exclude file: ${result.stderr.trim()}`)
  }
  const location = result.stdout.trim()
  const path = isAbsolute(location) ? location : resolve(cwd, location)
  const current = existsSync(path) ? readFileSync(path, 'utf8') : ''
  if (current.split('\n').includes(pattern)) return
  mkdirSync(dirname(path), { recursive: true })
  appendFileSync(path, `${current && !current.endsWith('\n') ? '\n' : ''}${pattern}\n`)
}
