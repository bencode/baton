import type { Id } from './ids.ts'

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
  title: string
  description?: string
  resources: ResourceRef[]
  tags: string[]
  status: RequirementStatus // stored, not derived
  createdAt: number
  updatedAt: number
}
