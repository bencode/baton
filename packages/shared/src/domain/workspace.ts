import type { Id } from './ids.ts'

// Shared collaboration boundary / isolation unit (a department or team space).
export type Workspace = {
  id: Id
  name: string
  createdAt: number
}
