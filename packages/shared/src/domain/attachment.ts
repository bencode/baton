import type { Id } from './ids.ts'

// A file/image uploaded to the server so a (possibly remote) Worker or channel
// peer can fetch it. The server keeps the bytes transiently on its filesystem;
// baton's model only ever carries this reference. Session attachments travel
// inside a user_message payload as `attachments` (the Worker downloads each into
// its worktree before the run); channel attachments are referenced by `url`.
// Exactly one scope id is set — `sessionId` xor `channelId` — and `url` is the
// authoritative download path either way.
export type Attachment = {
  id: string // server-generated (uuid)
  sessionId?: Id // set for session attachments
  channelId?: string // set for channel attachments
  filename: string // sanitized original name
  contentType: string
  size: number
  url: string // download path, e.g. /sessions/3/attachments/<id> or /channels/<id>/attachments/<id>
  createdAt: number
}

export const isImageAttachment = (att: Attachment): boolean => att.contentType.startsWith('image/')

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
