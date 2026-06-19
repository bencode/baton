// Surfaces connectivity problems the user would otherwise only see in daemon
// logs. Worker issues block message processing (shown first); a browser stream
// error is display-only (EventSource auto-retries). `attached` is treated as a
// transient warning here, not a session-state chip — a brief daemon SSE blip
// keeps heartbeating, so this only fires on a sustained drop.
type ConnectionBannerProps = { streamStatus: string; alive: boolean; attached: boolean }

export const ConnectionBanner = ({ streamStatus, alive, attached }: ConnectionBannerProps) => {
  const msg = !alive
    ? 'Worker offline — messages will be processed once it reconnects'
    : !attached
      ? 'Session not attached to its worker — messages won’t be processed yet'
      : streamStatus === 'error'
        ? 'Live connection lost, reconnecting… new messages may not appear immediately'
        : null
  if (!msg) return null
  return (
    <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800 sm:px-6">
      ⚠ {msg}
    </div>
  )
}
