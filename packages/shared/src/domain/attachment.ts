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

export const isImageAttachment = (att: Attachment): boolean =>
  att.contentType.startsWith('image/')

// Short, stable reference labels (image-1, image-2, file-1, …) keyed off type
// and position. Attachment order is preserved end-to-end — composer array →
// user_message payload → Worker download — so the web strip and the CLI prompt
// header derive identical labels independently, letting the user cite "{image-1}"
// in their text and have Claude resolve it to the right file.
export const labelAttachments = (attachments: Attachment[]): string[] => {
  const counters = { image: 0, file: 0 }
  return attachments.map(att => {
    const kind = isImageAttachment(att) ? 'image' : 'file'
    counters[kind] += 1
    return `${kind}-${counters[kind]}`
  })
}
