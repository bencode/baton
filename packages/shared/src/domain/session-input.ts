import type { Attachment } from './attachment.ts'
import type { Id } from './ids.ts'
import type { AgentEffort } from './session.ts'

export type SubmitInput = {
  text: string
  images?: string[]
  attachments?: Attachment[]
  replyExpected?: boolean
}

export type PendingInput = {
  id: Id
  sessionId: Id
  text: string
  images: string[]
  attachments: Attachment[]
  planMode: boolean
  model: string | null
  effort: AgentEffort | null
  replyExpected: boolean
  createdAt: number
}

export type SessionQueueSnapshot = { revision: number; items: PendingInput[] }
export type SubmitInputResult = {
  input: PendingInput
  queue: SessionQueueSnapshot
  sinceSequence: number
}
export type CancelInputResult = { removed: boolean; queue: SessionQueueSnapshot }
export type QueueChangedPayload = {
  revision: number
  addedIds?: Id[]
  consumedIds?: Id[]
  cancelledIds?: Id[]
}
export type UserMessagePayload = Omit<SubmitInput, 'replyExpected'> & {
  planMode: boolean
  model?: string
  effort?: AgentEffort
  inputIds: Id[]
  replyInputId?: Id
}
