import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { access, readFile, stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { promisify } from 'node:util'
import { type ConfiguredWorkerTemplateId, WORKER_TEMPLATES } from '@baton/shared'

export type WorkerTemplateConfig = {
  workerEnv: Record<string, string>
  pi?: { provider: string; model: string }
}

export type ProvisionerConfig = {
  server: string
  token: string
  projectsRoot: string
  cliPath: string
  nodePath?: string
  workerEnv: Record<string, string>
  templates: Record<ConfiguredWorkerTemplateId, WorkerTemplateConfig>
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

const environment = (value: unknown): Record<string, string> => {
  if (!object(value)) throw new Error('workerEnv must be an object')
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (
        forbiddenEnv.has(key) ||
        !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ||
        typeof entry !== 'string' ||
        entry.includes('\0')
      )
        throw new Error(`invalid worker environment key: ${key}`)
      return [key, entry]
    }),
  )
}

const templates = (value: unknown): ProvisionerConfig['templates'] => {
  if (!object(value)) throw new Error('templates must be an object')
  return Object.fromEntries(
    WORKER_TEMPLATES.map(template => {
      const raw = value[template.id]
      if (!object(raw)) throw new Error(`template ${template.id} must be configured`)
      const workerEnv = environment(raw.workerEnv)
      if (template.id === 'mini-codex') {
        if (raw.pi !== undefined) throw new Error('mini-codex does not support pi')
        return [template.id, { workerEnv }]
      }
      const provider = template.id === 'mini-glm-codeplan' ? 'zai-coding-cn' : 'qwen-token-plan-cn'
      const apiKey =
        template.id === 'mini-glm-codeplan' ? 'ZAI_CODING_CN_API_KEY' : 'QWEN_TOKEN_PLAN_CN_API_KEY'
      if (
        !workerEnv.ANTHROPIC_BASE_URL ||
        !(workerEnv.ANTHROPIC_AUTH_TOKEN || workerEnv.ANTHROPIC_API_KEY) ||
        !workerEnv[apiKey]
      )
        throw new Error(`template ${template.id} requires Claude and Pi credentials`)
      if (
        !object(raw.pi) ||
        raw.pi.provider !== provider ||
        typeof raw.pi.model !== 'string' ||
        !raw.pi.model.trim()
      )
        throw new Error(`template ${template.id} requires its Pi provider and model`)
      return [template.id, { workerEnv, pi: { provider, model: raw.pi.model.trim() } }]
    }),
  ) as ProvisionerConfig['templates']
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
  const config: ProvisionerConfig = {
    server: server.toString().replace(/\/$/, ''),
    token: raw.token.trim(),
    projectsRoot: absolutePath(raw.projectsRoot, 'projectsRoot'),
    cliPath: absolutePath(raw.cliPath, 'cliPath'),
    nodePath: absolutePath(raw.nodePath ?? process.execPath, 'nodePath'),
    workerEnv: environment(raw.workerEnv),
    templates: templates(raw.templates),
  }
  await access(config.cliPath, constants.R_OK)
  await access(config.nodePath ?? process.execPath, constants.X_OK)
  const env = commandEnvironment(config)
  await promisify(execFile)('git', ['--version'], { env, timeout: 10_000 })
  await promisify(execFile)('launchctl', ['help'], { env, timeout: 10_000 })
  await promisify(execFile)('/usr/bin/plutil', ['-help'], { timeout: 10_000 })
  return config
}
