// A Channel is an N-party live chat room — the multi-agent evolution of the
// 2-party relay. A capability primitive, independent of project/worker/session:
// an unguessable id + token. Unlike the relay, messages persist (history survives
// restart, so a web UI can read it); presence (who's online) stays in-memory.
import type { Attachment } from './attachment.ts'

export type MemberKind = 'agent' | 'human'

export type Channel = {
  id: string
  // The owning workspace. Creation + listing are gated by workspace membership;
  // participation is open on the channel id itself (the uuid is the capability).
  workspaceId: number
  title?: string
  // Free-text self-description: what this room is for / how to participate.
  description?: string
  // Server-stamped epoch milliseconds.
  createdAt: number
}

// One-call orientation for a newcomer: the channel's self-description + who is
// currently online + a pointer to the global protocol help. Returned by
// GET /channels/:id.
export type ChannelManifest = Channel & {
  members: ChannelMember[]
  // Relative path to the protocol doc; prepend your BASE → $BASE/channels/help.
  help: string
}

// One persisted message on a channel.
export type ChannelMessage = {
  id: number
  channelId: string
  // Per-channel monotonic sequence (1-based); doubles as the replay cursor.
  seq: number
  // Free-form sender label (the participant's chosen name).
  from: string
  senderKind: MemberKind
  text: string
  // Explicit recipients. Absent/empty = broadcast to the whole room; otherwise
  // directed at these names. A recipient treats a message as "for me" iff `to`
  // is empty/absent or includes its own name.
  to?: string[]
  // Files/images shared with the message. Each carries a reference name
  // (filename) + a download url; peers fetch by url (human via web, agent via the
  // GET attachments API). Absent when the message has no attachments.
  attachments?: Attachment[]
  // Server-stamped epoch milliseconds.
  ts: number
}

// A roster entry. Membership in the roster IS the online signal — only members
// seen within the presence TTL window are returned.
export type ChannelMember = {
  name: string
  kind: MemberKind
  lastSeenAt: number
}

// "Is this message addressed to `name`?" — a broadcast (no recipients) or one
// whose `to` list includes the name. The single authority for directed-vs-ambient,
// shared by the server filter and the CLI listener.
export const isMessageFor = (msg: { to?: string[] }, name: string): boolean =>
  !msg.to || msg.to.length === 0 || msg.to.includes(name)
