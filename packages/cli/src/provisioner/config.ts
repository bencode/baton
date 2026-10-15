import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { access, readFile, stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { promisify } from 'node:util'

export type ProvisionerConfig = {
  server: string
  token: string
  projectsRoot: string
  cliPath: string
  nodePath?: string
  workerEnv: Record<string, string>
}

const forbiddenEnv = new Set([
  'BATON_PROVISIONER_TOKEN',
  'BATON_TOKEN',
  'BATON_WORKER_TOKEN',
  'BATON_USER',
  'BATON_PASS',
  'HOME',
  'XDG_DATA_HOME',
])
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const absolutePath = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !isAbsolute(value) || value.includes('\0'))
    throw new Error(`${field} must be an absolute path`)
  return value
}

export const commandEnvironment = (config: ProvisionerConfig): NodeJS.ProcessEnv => ({
  ...process.env,
  PATH: config.workerEnv.PATH ?? process.env.PATH ?? '/usr/bin:/bin',
})

export const loadProvisionerConfig = async (path: string): Promise<ProvisionerConfig> => {
  if (process.platform !== 'darwin') throw new Error('provisioner requires macOS')
  absolutePath(path, 'config')
  if ((await stat(path)).mode & 0o077) throw new Error('config must be private: chmod 600 <config>')
  const text = await readFile(path, 'utf8')
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
    throw new Error('invalid provisioner JSON config')
  }
  if (!object(raw) || typeof raw.server !== 'string' || typeof raw.token !== 'string')
    throw new Error('server and token required')
  let server: URL
  try {
    server = new URL(raw.server)
  } catch (error) {
    if (!(error instanceof TypeError)) throw error
    throw new Error('server must be a valid HTTP(S) URL')
  }
  if (
    !['http:', 'https:'].includes(server.protocol) ||
    server.username ||
    server.password ||
    server.search ||
    server.hash
  )
    throw new Error('server must be an HTTP(S) URL without credentials, query, or fragment')
  if (!raw.token.trim() || /[\r\n]/.test(raw.token))
    throw new Error('valid provisioner token required')
  if (!object(raw.workerEnv)) throw new Error('workerEnv must be an object')
  const workerEnv = Object.fromEntries(
    Object.entries(raw.workerEnv).map(([key, value]) => {
      if (
        forbiddenEnv.has(key) ||
        !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ||
        typeof value !== 'string' ||
        value.includes('\0')
      )
        throw new Error(`invalid worker environment key: ${key}`)
      return [key, value]
    }),
  )
  const config: ProvisionerConfig = {
    server: server.toString().replace(/\/$/, ''),
    token: raw.token.trim(),
    projectsRoot: absolutePath(raw.projectsRoot, 'projectsRoot'),
    cliPath: absolutePath(raw.cliPath, 'cliPath'),
    nodePath: absolutePath(raw.nodePath ?? process.execPath, 'nodePath'),
    workerEnv,
  }
  await access(config.cliPath, constants.R_OK)
  await access(config.nodePath ?? process.execPath, constants.X_OK)
  const env = commandEnvironment(config)
  await promisify(execFile)('git', ['--version'], { env, timeout: 10_000 })
  await promisify(execFile)('launchctl', ['help'], { env, timeout: 10_000 })
  await promisify(execFile)('/usr/bin/plutil', ['-help'], { timeout: 10_000 })
  return config
}
