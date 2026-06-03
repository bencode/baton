import * as Lark from '@larksuiteoapi/node-sdk'

// A normalized inbound Feishu message — only the fields the bridge needs.
// `imageCodes` are Feishu image_keys (post/image messages); v0 forwards text
// only and notes images (download wiring is a follow-up — see media handling).
export type InboundMessage = {
  conversationId: string // chat_id (per-conversation; in a p2p chat = per-user)
  senderId: string // stable per-app user id (open_id; falls back to user/union id)
  sender: string // best-effort display id (open_id; real name needs a contact lookup)
  text: string
  imageCodes: string[] // Feishu image_keys
  messageId: string // for replying via the message API
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

// Group/@-mention messages carry "@_user_N" placeholder tokens in the text; drop
// them so the prompt reads cleanly (the mention metadata isn't needed here).
const cleanText = (t: string): string => t.replace(/@_user_\d+/g, '').trim()

// A `post` (rich text) body is { title?, content: Block[][] } where each block is
// { tag: 'text'|'a'|'img'|..., text?, image_key? }. Flatten to text + image_keys.
const flattenPost = (content: Record<string, unknown>): { text: string; imageKeys: string[] } => {
  const rows = Array.isArray(content.content) ? content.content : []
  const parts: string[] = []
  const imageKeys: string[] = []
  for (const row of rows) {
    if (!Array.isArray(row)) continue
    for (const el of row) {
      if (!isRecord(el)) continue
      if ((el.tag === 'text' || el.tag === 'a') && typeof el.text === 'string') parts.push(el.text)
      if (el.tag === 'img' && typeof el.image_key === 'string') imageKeys.push(el.image_key)
    }
  }
  return { text: cleanText(parts.join('')), imageKeys }
}

// Normalize a raw `im.message.receive_v1` event payload. Handles text / image /
// post (rich text); returns null for anything else (ignored upstream). content
// is a JSON string per Feishu's schema, parsed loosely.
export const parseInbound = (data: unknown): InboundMessage | null => {
  if (!isRecord(data) || !isRecord(data.message)) return null
  const message = data.message
  const chatId = str(message.chat_id)
  const messageId = str(message.message_id)
  const sid =
    isRecord(data.sender) && isRecord(data.sender.sender_id) ? data.sender.sender_id : null
  const senderId = sid ? str(sid.open_id) || str(sid.user_id) || str(sid.union_id) : ''
  if (!chatId || !senderId) return null
  const base = { conversationId: chatId, senderId, sender: senderId, messageId }

  let content: unknown
  try {
    content = JSON.parse(str(message.content))
  } catch {
    return null
  }
  if (!isRecord(content)) return null

  if (message.message_type === 'text')
    return { ...base, text: cleanText(str(content.text)), imageCodes: [] }
  if (message.message_type === 'image')
    return { ...base, text: '', imageCodes: str(content.image_key) ? [str(content.image_key)] : [] }
  if (message.message_type === 'post') {
    const { text, imageKeys } = flattenPost(content)
    return { ...base, text, imageCodes: imageKeys }
  }
  return null
}

export type StreamHandle = { disconnect: () => void }

// Connect to Feishu over a long-connection (websocket) and call `onMessage` for
// each text/image/post message. The SDK manages the connection + acks; we only
// parse + forward. Unsupported payloads are ignored.
export const startStream = (
  cfg: { appId: string; appSecret: string },
  onMessage: (msg: InboundMessage) => void,
): StreamHandle => {
  const wsClient = new Lark.WSClient({
    appId: cfg.appId,
    appSecret: cfg.appSecret,
    loggerLevel: Lark.LoggerLevel.warn,
  })
  wsClient.start({
    eventDispatcher: new Lark.EventDispatcher({}).register({
      'im.message.receive_v1': async (data: unknown) => {
        const msg = parseInbound(data)
        if (msg) onMessage(msg)
        else console.log('[feishu] ignored message (unsupported type)')
      },
    }),
  })
  // The WSClient owns its socket lifecycle; process exit tears it down.
  return { disconnect: () => {} }
}
