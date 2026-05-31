import type { Session } from '@baton/shared'
import { useState } from 'react'

// SessionHeader — one-line identity strip, gritty enough that the rest of the
// surface stays a quiet reading area. Diagnostic info (cwd, full agent UUID)
// is folded behind a single ⓘ toggle so they don't dominate every refresh.
//
// `active` reflects whether the worker has a live child for this session
// (instant via SessionView.attached); browser-SSE health lives in the banner.
type HeaderProps = {
  session: Session
  active: boolean
  onStop: () => void
  onResume: () => void
}

const truncateUuid = (id: string): string => {
  if (id.length <= 12) return id
  return `${id.slice(0, 8)}…${id.slice(-4)}`
}

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false)
  const onCopy = () => {
    void navigator.clipboard.writeText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      type="button"
      onClick={onCopy}
      className="text-gray-400 transition-colors hover:text-gray-700"
      aria-label={copied ? 'copied' : 'copy'}
    >
      {copied ? '✓' : '⌘'}
    </button>
  )
}

export const SessionHeader = ({ session, active, onStop, onResume }: HeaderProps) => {
  const [open, setOpen] = useState(false)
  return (
    <div className="shrink-0 border-b border-gray-200 bg-white px-6 py-3">
      <div className="flex items-center gap-3 text-sm">
        <span className="font-semibold tracking-tight text-gray-900">{session.name}</span>
        <span aria-hidden className="text-gray-300">
          ·
        </span>
        <span className="font-mono text-xs text-gray-500">{session.agentKind}</span>
        <span aria-hidden className="text-gray-300">
          ·
        </span>
        <span className="font-mono text-xs text-gray-500">
          {session.agentSessionId ? truncateUuid(session.agentSessionId) : 'materializing…'}
        </span>
        <CopyButton text={session.agentSessionId ?? ''} />
        <span aria-hidden className="text-gray-300">
          ·
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-gray-500">
          <span
            className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-gray-300'}`}
          />
          {active ? 'active' : 'inactive'}
        </span>
        {active ? (
          <button
            type="button"
            onClick={onStop}
            className="rounded border border-gray-200 px-1.5 text-xs text-gray-500 transition-colors hover:border-amber-300 hover:text-amber-600"
          >
            stop
          </button>
        ) : (
          <button
            type="button"
            onClick={onResume}
            className="rounded border border-emerald-300 px-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-50"
          >
            resume
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="text-xs text-gray-400 transition-colors hover:text-gray-700"
          aria-label={open ? 'hide details' : 'show details'}
        >
          {open ? '▾' : 'ⓘ'}
        </button>
      </div>
      {open && (
        <div className="mt-2 flex flex-col gap-0.5 font-mono text-xs text-gray-500">
          <span>cwd: {session.worktreePath ?? '(pending materialize)'}</span>
          <span>agent session: {session.agentSessionId ?? '(pending materialize)'}</span>
        </div>
      )}
    </div>
  )
}
