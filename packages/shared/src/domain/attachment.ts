import type { Id } from './ids.ts'

// A file/image uploaded to the server so a (possibly remote) Worker can fetch
// it. The server keeps the bytes transiently on its filesystem; baton's model
// only ever carries this reference. Travels inside a user_message payload as
// `attachments`, and the Worker downloads each into its worktree before the run.
export type Attachment = {
  id: string // server-generated (uuid)
  sessionId: Id
  filename: string // sanitized original name
  contentType: string
  size: number
  url: string // download path, e.g. /sessions/3/attachments/<id>
  createdAt: number
}
