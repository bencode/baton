import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Id } from '@baton/shared'

// Persistent binding-key → sessionId map, owned entirely by the bridge (baton
// core never learns about Feishu). The key is per conversation AND sender
// (`conversationId:senderId`) so each person in a group gets their own session.
// A small JSON file so it survives restarts; nothing here needs a real db.
export type BindingStore = {
  get(key: string): Id | undefined
  set(key: string, sessionId: Id): void
}

// Honor an explicit path env (a persisted volume in container deploys) so the
// user→session map survives restarts; local dev falls back to homedir.
const defaultPath = (): string =>
  process.env.BATON_FEISHU_BINDINGS ??
  join(homedir(), '.local', 'share', 'baton', 'feishu-bindings.json')

export const createBindingStore = (path: string = defaultPath()): BindingStore => {
  const load = (): Record<string, Id> => {
    try {
      const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
      return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, Id>) : {}
    } catch {
      return {}
    }
  }
  const map = load()
  return {
    get: key => map[key],
    set: (key, sessionId) => {
      map[key] = sessionId
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, JSON.stringify(map, null, 2))
    },
  }
}
