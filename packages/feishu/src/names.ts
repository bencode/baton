import type * as Lark from '@larksuiteoapi/node-sdk'

// Feishu message events carry only the sender's open_id (no display name). Resolve
// it to a name via the chat's member list — this reuses the `im` permission the
// bot already has (no extra contact/通讯录 scope), the same way the old rooma bot
// did it. Cached per chat with a short TTL; best-effort (falls back to the open_id
// if the lookup is empty / unpermitted), so naming never blocks a reply.

const TTL_MS = 10 * 60_000
type Entry = { names: Map<string, string>; at: number }
const cache = new Map<string, Entry>()

const loadMembers = async (client: Lark.Client, chatId: string): Promise<Map<string, string>> => {
  const names = new Map<string, string>()
  try {
    const res = await client.im.chatMembers.get({
      path: { chat_id: chatId },
      params: { member_id_type: 'open_id', page_size: 100 },
    })
    for (const m of res.data?.items ?? []) {
      if (m.member_id && m.name) names.set(m.member_id, m.name)
    }
  } catch {
    // no member-read permission / p2p quirk → empty map, caller falls back to id
  }
  return names
}

export const resolveSenderName = async (
  client: Lark.Client,
  chatId: string,
  openId: string,
): Promise<string> => {
  const now = Date.now()
  let entry = cache.get(chatId)
  if (!entry || now - entry.at > TTL_MS) {
    entry = { names: await loadMembers(client, chatId), at: now }
    cache.set(chatId, entry)
  }
  return entry.names.get(openId) || openId
}
