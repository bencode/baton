import type { FinishedTurn } from './store/types.ts'

export type PushMessage = { title: string; body: string; url: string; tag: string }

// Shorter turns finish while the sender is most likely still watching.
export const MIN_TURN_MS = 30_000
const BODY_MAX = 120

const truncate = (text: string): string =>
  text.length > BODY_MAX ? `${text.slice(0, BODY_MAX - 1)}…` : text

const firstLine = (text: string): string =>
  text
    .split('\n')
    .map(line => line.trim())
    .find(Boolean) ?? text

const bodyFor = (turn: FinishedTurn): string => {
  if (turn.type === 'turn_error') return truncate(`失败：${turn.errorMessage ?? '未知错误'}`)
  if (!turn.replyText) return '已完成'
  return turn.planMode
    ? truncate(`计划已就绪：${firstLine(turn.replyText)}`)
    : truncate(turn.replyText)
}

// Only "your turn" moments reach a phone: a finished or failed turn somebody sent
// and is probably no longer watching. Retrying turns have not ended yet.
export const toPushMessage = (turn: FinishedTurn): PushMessage | null => {
  if (turn.retrying || turn.senderUserIds.length === 0 || turn.finishedAt == null) return null
  if (turn.finishedAt - turn.startedAt < MIN_TURN_MS) return null
  return {
    title: `${turn.projectName} · ${turn.session.name}`,
    body: bodyFor(turn),
    url: `/proj/${turn.session.projectId}/session/${turn.session.id}`,
    // One notification per session: a newer one replaces the older.
    tag: `session-${turn.session.id}`,
  }
}
