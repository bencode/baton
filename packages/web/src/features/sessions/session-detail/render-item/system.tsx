// Centered hairline notice for session-level events (e.g. /clear). Lighter than
// a turn divider — no capsule, just dimmed text between two faint rules.
export const SystemNotice = ({ text }: { text: string }) => (
  <div className="my-4 flex items-center gap-3">
    <div className="h-px flex-1 bg-gray-100" />
    <span className="font-mono text-[11px] text-gray-400">🆕 {text}</span>
    <div className="h-px flex-1 bg-gray-100" />
  </div>
)

export const SystemHeader = ({ model, sessionId }: { model?: string; sessionId?: string }) => (
  <div className="flex items-center gap-2 font-mono text-[11px] text-gray-400">
    <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5">
      {model ?? 'agent'}
    </span>
    {sessionId && <span>session {sessionId.slice(0, 8)}</span>}
  </div>
)

export const RawBlock = ({ payload }: { payload: unknown }) => (
  <pre className="overflow-x-auto rounded border border-gray-100 bg-white p-2 font-mono text-[11px] whitespace-pre-wrap break-words text-gray-500">
    {JSON.stringify(payload, null, 2)}
  </pre>
)
