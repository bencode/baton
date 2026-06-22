// Surfaces connectivity problems the user would otherwise only see in daemon
// logs. `!connected` (the worker's command stream is down) is the real blocker —
// a message would be rejected until it reconnects. A browser stream error is
// display-only (EventSource auto-retries). Runner-attached state isn't surfaced:
// sending to a connected worker auto-resumes it, so "not attached" no longer
// blocks message processing.
type ConnectionBannerProps = { streamStatus: string; connected: boolean }

export const ConnectionBanner = ({ streamStatus, connected }: ConnectionBannerProps) => {
  const msg = !connected
    ? 'Worker offline — messages will be processed once it reconnects'
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
