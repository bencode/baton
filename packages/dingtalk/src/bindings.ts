import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Id } from '@baton/shared'

// Persistent binding-key → sessionId map, owned entirely by the bridge (baton
// core never learns about DingTalk). The key is per conversation AND sender
// (`conversationId:senderId`) so each person in a group gets their own session.
// A small JSON file so it survives restarts; nothing here needs a real db.
export type BindingStore = {
  get(key: string): Id | undefined
  set(key: string, sessionId: Id): void
}

// In docker the homedir is ephemeral (the bridge has no volume by default), so
// honor an explicit path env — the compose stack points it at a named volume so
// the user→session map survives redeploys. Local dev falls back to homedir.
const defaultPath = (): string =>
  process.env.BATON_DINGTALK_BINDINGS ??
  join(homedir(), '.local', 'share', 'baton', 'dingtalk-bindings.json')

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
