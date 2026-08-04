import type { Id } from './ids.ts'

export type Artifact = {
  id: Id
  projectId: Id
  key: string
  filename: string
  contentType: string
  size: number
  url: string
  downloadUrl: string
  createdAt: number
}
