import * as Lark from '@larksuiteoapi/node-sdk'
import { createBindingStore } from './bindings.ts'
import { authedFetch, createBatonClient } from './client.ts'
import { applyTemplate, type FeishuConfig, loadConfig } from './config.ts'
import { ensureSession } from './ensure-session.ts'
import { reply } from './reply.ts'
import { type InboundMessage, startStream } from './stream.ts'
import { waitForTurn } from './wait-turn.ts'

// The Feishu → baton bridge: a standalone process. It receives Feishu messages
// over a long-connection and drives baton sessions purely through the public
// HTTP API — no coupling to baton's internals. Mirrors the DingTalk bridge; the
// transport (lark WSClient) and reply (lark Client) are the only differences.
const log = (m: string): void => console.log(`[feishu] ${m}`)

// Agentic turns can run for minutes; wait generously, and on timeout still link
// the session so the user can watch it finish in baton.
const TURN_TIMEOUT_MS = 10 * 60_000

// Reply: the agent's answer inline, then a "详情 #N" link line (Feishu
// auto-linkifies the URL). No answer (timeout / empty) → just the link.
const MAX_REPLY = 3500
const replyText = (sessionId: number, link: string, text: string): string => {
  const linkLine = `详情 #${sessionId}: ${link}`
  const body = text.trim()
  if (!body) return `👉 ${linkLine}`
  const shown =
    body.length > MAX_REPLY ? `${body.slice(0, MAX_REPLY)}\n\n…(内容较长，点开查看完整)` : body
  return `${shown}\n\n${linkLine}`
}

const main = (): void => {
  const cfg: FeishuConfig = loadConfig()
  const client = createBatonClient(cfg.server, { token: cfg.token, creds: cfg.creds })
  const lark = new Lark.Client({ appId: cfg.appId, appSecret: cfg.appSecret })
  const bindings = createBindingStore()

  const onMessage = async (msg: InboundMessage): Promise<void> => {
    const imgNote = msg.imageCodes.length > 0 ? ` [+${msg.imageCodes.length} img, skipped]` : ''
    // Per-user session: key by conversation AND sender so each person in a group
    // gets an isolated context (a 1-on-1 chat is one sender anyway).
    const key = `${msg.conversationId}:${msg.senderId}`
    log(`← ${msg.sender}: ${msg.text}${imgNote}  (chat ${msg.conversationId})`)
    if (!msg.text) {
      // v0 forwards text only; an image-only message has nothing to relay yet.
      await reply(lark, msg.conversationId, '（暂只支持文本消息，图片稍后支持）').catch(() => {})
      return
    }
    try {
      const sessionId = await ensureSession(client, bindings, cfg.route, key)
      const prompt = applyTemplate(cfg.promptTemplate, msg.sender, msg.text)
      const ev = await client.sendMessage(sessionId, prompt)
      log(`→ delivered to session #${sessionId} (msg ${ev.id}), waiting…`)
      // `?since` bounds the replay to our message onward — no full-history re-read.
      const { outcome, text } = await waitForTurn(
        `${client.streamUrl(sessionId)}?since=${ev.sequence}`,
        ev.id,
        TURN_TIMEOUT_MS,
        authedFetch,
      )
      const view = await client.getSession(sessionId)
      const link = `${cfg.webBase}/s/${view.shareToken ?? sessionId}`
      await reply(lark, msg.conversationId, replyText(sessionId, link, text))
      log(`→ replied (${outcome}, ${text.length} chars) ${link}`)
    } catch (e) {
      log(`failed: ${e instanceof Error ? e.message : String(e)}`)
      await reply(
        lark,
        msg.conversationId,
        `处理失败：${e instanceof Error ? e.message : String(e)}`,
      ).catch(() => {})
    }
  }

  startStream(cfg, msg => void onMessage(msg))
  log(
    `listening (server ${cfg.server}, route project=${cfg.route.projectId} worker=${cfg.route.workerId})`,
  )
  const shutdown = (): void => process.exit(0)
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main()
