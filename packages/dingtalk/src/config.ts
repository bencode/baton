import type { Id } from '@baton/shared'
import type { BatonCreds } from './client.ts'

// All config comes from the environment — the bridge owns its own settings and
// never reads baton's project config. v0 is a single fixed route: every DingTalk
// message goes to one (project, worker).
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

const requiredInt = (name: string): number => {
  const v = required(name)
  const n = Number(v)
  if (!Number.isInteger(n) || n <= 0)
    throw new Error(`env ${name} must be a positive integer (got ${v})`)
  return n
}

const optionalCreds = (): BatonCreds | undefined => {
  const username = process.env.BATON_USER
  const password = process.env.BATON_PASS
  return username && password ? { username, password } : undefined
}

export const loadConfig = (): DingtalkConfig => ({
  server: process.env.BATON_SERVER ?? 'http://localhost:3280',
  webBase: process.env.BATON_WEB_BASE ?? 'http://localhost:5280',
  promptTemplate: process.env.DINGTALK_PROMPT_TEMPLATE ?? DEFAULT_PROMPT,
  route: { projectId: requiredInt('BATON_PROJECT_ID'), workerId: requiredInt('BATON_WORKER_ID') },
  clientId: required('DINGTALK_CLIENT_ID'),
  clientSecret: required('DINGTALK_CLIENT_SECRET'),
  token: process.env.BATON_TOKEN,
  creds: optionalCreds(),
})
