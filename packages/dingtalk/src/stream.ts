import { DWClient, type DWClientDownStream, EventAck, TOPIC_ROBOT } from 'dingtalk-stream'

// A normalized inbound DingTalk message — only the fields the bridge needs.
// `imageCodes` are DingTalk file downloadCodes (richText pictures); the bridge
// resolves them to bytes and forwards them as session attachments.
export type InboundMessage = {
  conversationId: string
  senderId: string // stable per-user id (senderStaffId; falls back to senderId/nick)
  sender: string
  text: string
  imageCodes: string[]
  sessionWebhook: string // per-message reply URL
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

// Normalize a raw TOPIC_ROBOT payload. DingTalk sends a plain text message as
// `msgtype:'text'`, but text-with-images (or image-only) arrives as
// `msgtype:'richText'` with a `content.richText[]` of text/picture items — so we
// must handle richText or the whole message (text included) is dropped. Returns
// null for anything else (acked + ignored upstream).
export const parseInbound = (raw: unknown): InboundMessage | null => {
  if (!isRecord(raw)) return null
  const base = {
    conversationId: str(raw.conversationId),
    senderId: str(raw.senderStaffId) || str(raw.senderId) || str(raw.senderNick),
    sender: str(raw.senderNick),
    sessionWebhook: str(raw.sessionWebhook),
  }
  if (raw.msgtype === 'text' && isRecord(raw.text))
    return { ...base, text: str(raw.text.content), imageCodes: [] }
  if (raw.msgtype === 'richText' && isRecord(raw.content) && Array.isArray(raw.content.richText)) {
    const items = raw.content.richText.filter(isRecord)
    return {
      ...base,
      text: items
        .map(i => str(i.text))
        .join('')
        .trim(),
      imageCodes: items.flatMap(i => (typeof i.downloadCode === 'string' ? [i.downloadCode] : [])),
    }
  }
  return null
}

export type StreamHandle = { disconnect: () => void }

// Connect to DingTalk Stream and call `onMessage` for each bot text/richText
// message. We ack every callback (socketCallBackResponse) so DingTalk doesn't
// re-push on its ~60s retry timer. Unsupported / malformed payloads are acked
// and ignored.
export const startStream = (
  cfg: { clientId: string; clientSecret: string },
  onMessage: (msg: InboundMessage) => void,
): StreamHandle => {
  const client = new DWClient({ clientId: cfg.clientId, clientSecret: cfg.clientSecret })
  client.registerCallbackListener(TOPIC_ROBOT, (res: DWClientDownStream) => {
    try {
      const raw: unknown = JSON.parse(res.data)
      const msg = parseInbound(raw)
      if (msg) onMessage(msg)
      else
        console.log(`[dingtalk] ignored message (msgtype=${(raw as { msgtype?: string }).msgtype})`)
    } catch {
      // ignore malformed payloads
    } finally {
      client.socketCallBackResponse(res.headers.messageId, { status: EventAck.SUCCESS })
    }
  })
  void client.connect()
  return { disconnect: () => client.disconnect() }
}
