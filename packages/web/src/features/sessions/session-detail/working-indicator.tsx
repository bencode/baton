import { StopIcon } from './icons'

// Shown just above the composer while the agent is processing a turn. A calm
// breathing dot + label ("thinking…") so the user knows it's alive during the
// gap before the first token streams in, plus an always-actionable 停止 button
// that interrupts the turn (same as /abort). Visibility is decided by the caller
// (session-detail) from the turn liveness derived in event-render.
export const WorkingIndicator = ({ onAbort }: { onAbort: () => void }) => (
  <div className="shrink-0 bg-white px-6 pt-1 pb-1.5">
    <div className="mx-auto flex max-w-5xl items-center gap-1.5">
      {/* breathing only on the live indicator, not the button */}
      <span className="animate-breathe flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
        <span className="font-mono text-xs text-blue-600">思考中…</span>
      </span>
      <button
        type="button"
        onClick={onAbort}
        title="停止"
        aria-label="停止"
        className="flex h-5 w-5 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
      >
        <StopIcon />
      </button>
    </div>
  </div>
)
