// Surfaces connectivity problems the user would otherwise only see in daemon
// logs. Worker issues block message processing (shown first); a browser stream
// error is display-only (EventSource auto-retries). `attached` is treated as a
// transient warning here, not a session-state chip — a brief daemon SSE blip
// keeps heartbeating, so this only fires on a sustained drop.
type ConnectionBannerProps = { streamStatus: string; alive: boolean; attached: boolean }

export const ConnectionBanner = ({ streamStatus, alive, attached }: ConnectionBannerProps) => {
  const msg = !alive
    ? 'Worker 离线 — 消息会在它重新上线后才被处理'
    : !attached
      ? '会话未连接到 Worker — 发送的消息暂时不会被处理'
      : streamStatus === 'error'
        ? '实时连接中断，正在重连… 期间的新消息可能不会即时显示'
        : null
  if (!msg) return null
  return (
    <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-6 py-1.5 text-xs text-amber-800">
      ⚠ {msg}
    </div>
  )
}
