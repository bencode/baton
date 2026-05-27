import type { Id } from './ids.ts'

// Pure aggregation/grouping with no lifecycle of its own (no status).
// The product dimension is carried by Requirement.
export type Project = {
  id: Id
  workspaceId: Id
  name: string
  description?: string
  createdAt: number
}
