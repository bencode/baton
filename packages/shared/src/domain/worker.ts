import type { Id } from './ids.ts'

// Execution endpoint: registers capabilities and claims tasks. Runtime-only, not persisted
// (connection/session land in M2).
export type Worker = {
  id: Id
  name: string
  capabilities: string[]
}
