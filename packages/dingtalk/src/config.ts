import type { Id } from '@baton/shared'
import { readBatonConfig } from './baton-config.ts'
import type { BatonCreds } from './client.ts'

// Config: bot creds + prompt come from the operator's env (their own app, never
// shared with baton); the baton server URL + (project, worker) route + auth token
// are reused from the worker's `.baton.json` when present (run the bridge next to
// `baton worker run`), and any of those can be overridden by env. A single fixed
// route: every DingTalk message goes to one (project, worker).
export type DingtalkConfig = {
  server: string
  webBase: string
  promptTemplate: string
  route: { projectId: Id; workerId: Id }
  clientId: string
  clientSecret: string
  // Machine auth (when the server enforces auth). Prefer a personal API token
  // (BATON_TOKEN); BATON_USER/PASS cookie login is a fallback. Both undefined →
  // open server (dev / auth-off).
  token?: string
  creds?: BatonCreds
}

// Default prompt: just relays who said what. Set DINGTALK_PROMPT_TEMPLATE to
// invoke a project Skill, e.g. "收到钉钉消息(来自 {sender}):\n{text}\n\n请用 xxx 技能处理。"
const DEFAULT_PROMPT = '收到钉钉消息(来自 {sender}):\n\n{text}'

// Substitute {sender} / {text} into the configured template.
export const applyTemplate = (template: string, sender: string, text: string): string =>
  template.replaceAll('{sender}', sender).replaceAll('{text}', text)

const required = (name: string): string => {
  const v = process.env[name]
  if (!v) throw new Error(`missing env ${name}`)
  return v
}

// A positive-int route field: env wins, else the worker's .baton.json, else throw.
const resolveInt = (name: string, fallback?: number): number => {
  const raw = process.env[name]
  if (raw !== undefined) {
    const n = Number(raw)
    if (!Number.isInteger(n) || n <= 0)
      throw new Error(`env ${name} must be a positive integer (got ${raw})`)
    return n
  }
  if (fallback !== undefined && Number.isInteger(fallback) && fallback > 0) return fallback
  throw new Error(`missing ${name} — set the env, or run from a worker dir with a .baton.json`)
}

const optionalCreds = (): BatonCreds | undefined => {
  const username = process.env.BATON_USER
  const password = process.env.BATON_PASS
  return username && password ? { username, password } : undefined
}

export const loadConfig = (): DingtalkConfig => {
  const base = readBatonConfig()
  return {
    server: process.env.BATON_SERVER ?? base.server ?? 'http://localhost:3280',
    webBase: process.env.BATON_WEB_BASE ?? 'http://localhost:5280',
    promptTemplate: process.env.DINGTALK_PROMPT_TEMPLATE ?? DEFAULT_PROMPT,
    route: {
      projectId: resolveInt('BATON_PROJECT_ID', base.projectId),
      workerId: resolveInt('BATON_WORKER_ID', base.workerId),
    },
    clientId: required('DINGTALK_CLIENT_ID'),
    clientSecret: required('DINGTALK_CLIENT_SECRET'),
    token: process.env.BATON_TOKEN ?? base.token,
    creds: optionalCreds(),
  }
}
