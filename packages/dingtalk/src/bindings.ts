import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Id } from '@baton/shared'

// Persistent conversation → sessionId map, owned entirely by the bridge (baton
// core never learns about DingTalk). A small JSON file so it survives restarts;
// nothing here is hot enough to need a real db.
export type BindingStore = {
  get(conversationId: string): Id | undefined
  set(conversationId: string, sessionId: Id): void
}

const defaultPath = (): string =>
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
    get: conversationId => map[conversationId],
    set: (conversationId, sessionId) => {
      map[conversationId] = sessionId
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, JSON.stringify(map, null, 2))
    },
  }
}
