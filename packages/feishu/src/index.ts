import * as Lark from '@larksuiteoapi/node-sdk'
import { createBindingStore } from './bindings.ts'
import { authedFetch, createBatonClient } from './client.ts'
import { parseNewCommand } from './commands.ts'
import { applyTemplate, type FeishuConfig, loadConfig } from './config.ts'
import { ensureSession } from './ensure-session.ts'
import { resolveSenderName } from './names.ts'
import { addReaction, removeReaction } from './reactions.ts'
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
    // The event only carries open_id; resolve a display name (best-effort) so the
    // agent knows who's talking. Cached per chat.
    const senderName = await resolveSenderName(lark, msg.conversationId, msg.senderId)
    log(`← ${senderName}: ${msg.text}${imgNote}  (chat ${msg.conversationId})`)
    if (!msg.text) {
      // v0 forwards text only; an image-only message has nothing to relay yet.
      await reply(lark, msg.conversationId, '（暂只支持文本消息，图片稍后支持）').catch(() => {})
      return
    }
    // "Seen + on it" — show a processing reaction on the user's message for the
    // whole turn, cleared once we reply (or time out / error).
    const reactionId = await addReaction(lark, msg.messageId)
    try {
      const cmd = parseNewCommand(msg.text)
      const { id: sessionId, active } = await ensureSession(client, bindings, cfg.route, key, {
        forceNew: cmd.forceNew,
      })
      if (cmd.forceNew && !cmd.text) {
        // Bare "/new": session created + bound; nothing to ask the agent yet.
        const view = await client.getSession(sessionId)
        const link = `${cfg.webBase}/s/${view.shareToken ?? sessionId}`
        await reply(lark, msg.conversationId, `🆕 已开新会话 #${sessionId}: ${link}`)
        log(`→ new session #${sessionId} (bare /new) ${link}`)
        return
      }
      if (!active) {
        // Worker didn't attach within the grace window (offline, or a very slow
        // cold spawn). The server rejects messages to inactive sessions (409),
        // so be honest: this message was NOT delivered — point at the web page
        // (which can resume/send once the worker returns).
        const view = await client.getSession(sessionId)
        const link = `${cfg.webBase}/s/${view.shareToken ?? sessionId}`
        await reply(
          lark,
          msg.conversationId,
          `⚠️ worker 未就绪（可能离线），这条消息未送达 — 请稍后重发，或点链接在网页继续：详情 #${sessionId}: ${link}`,
        )
        log(`→ not delivered, session #${sessionId} never attached ${link}`)
        return
      }
      const prompt = applyTemplate(cfg.promptTemplate, senderName, cmd.text)
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
    } finally {
      if (reactionId) await removeReaction(lark, msg.messageId, reactionId)
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
