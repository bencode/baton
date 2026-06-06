import { type Attachment, isPlaceholderSessionName } from '@baton/shared'
import { createBindingStore } from './bindings.ts'
import { authedFetch, type BatonClient, createBatonClient } from './client.ts'
import { applyTemplate, type DingtalkConfig, loadConfig } from './config.ts'
import { ensureSession } from './ensure-session.ts'
import { downloadImage } from './media.ts'
import { reply } from './reply.ts'
import { type InboundMessage, startStream } from './stream.ts'
import { waitForTurn } from './wait-turn.ts'

// The DingTalk → baton bridge: a standalone process. It receives DingTalk
// messages over a Stream long connection and drives baton sessions purely
// through the public HTTP API — no coupling to baton's internals.
const log = (m: string): void => console.log(`[dingtalk] ${m}`)

// Agentic turns can run for minutes; wait generously, and on timeout still link
// the session so the user can watch it finish in baton.
const TURN_TIMEOUT_MS = 10 * 60_000

// Reply card: the agent's answer inline (so simple Q&A is readable without
// clicking through), then a "查看详情 #N" link. The id (ticket number) tags the link so
// different conversations' replies are distinguishable (the URL is an opaque
// token). No answer (timeout / empty) → just the link.
const MAX_REPLY = 3500
const replyText = (sessionId: number, link: string, text: string): string => {
  const linkLine = `[查看详情 #${sessionId}](${link})`
  const body = text.trim()
  if (!body) return `👉 ${linkLine}`
  const shown =
    body.length > MAX_REPLY ? `${body.slice(0, MAX_REPLY)}\n\n…(内容较长，点开查看完整)` : body
  return `${shown}\n\n${linkLine}`
}

// Resolve DingTalk image downloadCodes → uploaded session attachments,
// best-effort: a failed image is logged and skipped, never blocking the text.
const collectImages = async (
  client: BatonClient,
  cfg: DingtalkConfig,
  sessionId: number,
  codes: string[],
  log: (m: string) => void,
): Promise<Attachment[]> => {
  const out: Attachment[] = []
  for (const [i, code] of codes.entries()) {
    try {
      out.push(await client.uploadAttachment(sessionId, await downloadImage(cfg, code, i)))
    } catch (e) {
      log(`image ${i} failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return out
}

const main = (): void => {
  const cfg = loadConfig()
  const client = createBatonClient(cfg.server, { token: cfg.token, creds: cfg.creds })
  const bindings = createBindingStore()

  const onMessage = async (msg: InboundMessage): Promise<void> => {
    const imgNote = msg.imageCodes.length > 0 ? ` [+${msg.imageCodes.length} img]` : ''
    // Per-user session: key by conversation AND sender so each person in a group
    // gets an isolated context (a 1-on-1 chat is one sender anyway).
    const key = `${msg.conversationId}:${msg.senderId}`
    log(
      `← ${msg.sender}: ${msg.text}${imgNote}  (conv ${msg.conversationId}, sender ${msg.senderId})`,
    )
    try {
      const { id: sessionId, active } = await ensureSession(client, bindings, cfg.route, key)
      const prompt = applyTemplate(cfg.promptTemplate, msg.sender, msg.text)
      const attachments = await collectImages(client, cfg, sessionId, msg.imageCodes, log)
      const ev = await client.sendMessage(sessionId, prompt, attachments)
      if (!active) {
        // Worker not attached yet (offline / stream reconnecting): the message
        // is queued server-side. Link the session now instead of holding the
        // chat hostage to a 10-minute turn wait — the user watches it there.
        const view = await client.getSession(sessionId)
        const link = `${cfg.webBase}/s/${view.shareToken ?? sessionId}`
        await reply(
          msg.sessionWebhook,
          `⏳ worker 暂未就绪，消息已排队，处理后可在链接查看：\n[查看详情 #${sessionId}](${link})`,
          'baton',
        )
        log(`→ queued on session #${sessionId} (worker not attached) ${link}`)
        return
      }
      log(
        `→ delivered to session #${sessionId} (msg ${ev.id}, ${attachments.length} img), waiting…`,
      )
      // `?since` bounds the replay to our message onward — no full-history re-read.
      const { outcome, text } = await waitForTurn(
        `${client.streamUrl(sessionId)}?since=${ev.sequence}`,
        ev.id,
        TURN_TIMEOUT_MS,
        authedFetch,
      )
      // Deep link uses the unguessable share token (opens without a manual login).
      const view = await client.getSession(sessionId)
      const link = `${cfg.webBase}/s/${view.shareToken ?? sessionId}`
      // Card title = the session's auto-title once it has one; until then "baton".
      const cardTitle = isPlaceholderSessionName(view.name) ? 'baton' : view.name
      await reply(msg.sessionWebhook, replyText(sessionId, link, text), cardTitle)
      log(`→ replied (${outcome}, ${text.length} chars) ${link}`)
    } catch (e) {
      log(`failed: ${e instanceof Error ? e.message : String(e)}`)
      // Tell the user — a silent drop reads as "the bot ignored me".
      await reply(
        msg.sessionWebhook,
        `处理失败：${e instanceof Error ? e.message : String(e)}`,
        'baton',
      ).catch(() => {})
    }
  }

  const stream = startStream(cfg, msg => void onMessage(msg))
  log(
    `listening (server ${cfg.server}, route project=${cfg.route.projectId} worker=${cfg.route.workerId})`,
  )
  const shutdown = (): void => {
    stream.disconnect()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main()
