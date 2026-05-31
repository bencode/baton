import type { Code, Id } from './ids.ts'

export type ResourceKind = 'doc' | 'link' | 'file'

// Reference to content living in the repo (baton stores only references; content stays in git).
export type ResourceRef = {
  kind: ResourceKind
  uri: string
  label?: string
}

// Product/intent-dimension lifecycle: stored independently, advanced explicitly by a human/agent,
// informed by task progress but not driven by it.
export type RequirementStatus = 'active' | 'done' | 'cancelled'

// The sole carrier of the product dimension; also the aggregate container of tasks (holds context).
export type Requirement = {
  id: Id
  projectId: Id
  code: Code // 'R-1', 'R-2', ... — project-scoped human reference
  title: string
  description?: string
  body?: string // detailed content (Markdown); rendered with the shared Markdown component
  resources: ResourceRef[]
  status: RequirementStatus // stored, not derived
  createdAt: number
  updatedAt: number
}
