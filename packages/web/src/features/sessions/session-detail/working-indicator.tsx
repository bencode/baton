// Shown just above the composer while the agent is processing a turn. A calm
// breathing dot + label ("thinking…") so the user knows it's alive during the
// gap before the first token streams in. Visibility is decided by the caller
// (session-detail) from the turn liveness derived in event-render.
export const WorkingIndicator = () => (
  <div className="shrink-0 bg-white px-6 pt-1 pb-1.5">
    <div className="animate-breathe mx-auto flex max-w-5xl items-center gap-2">
      <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
      <span className="font-mono text-xs text-blue-600">思考中…</span>
    </div>
  </div>
)
