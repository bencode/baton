import type { Session } from '@baton/shared'
import { useState } from 'react'
import { standaloneSessionPath } from '../../../app/route'

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
  onRename: (name: string) => void
}

// Click the name to rename inline: Enter/blur commits, Esc cancels. A no-op
// commit (blank or unchanged) just closes the editor. The new name propagates
// back through the live session view (project stream), so we don't echo locally.
const SessionName = ({ name, onRename }: { name: string; onRename: (n: string) => void }) => {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  if (!editing)
    return (
      <button
        type="button"
        title="rename"
        onClick={() => {
          setDraft(name)
          setEditing(true)
        }}
        className="font-semibold tracking-tight text-gray-900 decoration-dotted hover:underline"
      >
        {name}
      </button>
    )
  const commit = () => {
    const next = draft.trim()
    setEditing(false)
    if (next && next !== name) onRename(next)
  }
  return (
    <input
      // biome-ignore lint/a11y/noAutofocus: rename editor opens on explicit user click
      autoFocus
      aria-label="session name"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onFocus={e => e.target.select()}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          setEditing(false)
        }
      }}
      className="w-48 rounded border border-gray-300 px-1 text-sm font-semibold text-gray-900 focus:border-blue-400 focus:outline-none"
    />
  )
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

// Copy the standalone collaboration link (/s/:token) — same URL the DingTalk /
// Feishu bots push. Anyone with the link can read the transcript and write into
// the session (share token logs the visitor in with full permissions).
const ShareButton = ({ shareToken }: { shareToken: string }) => {
  const [copied, setCopied] = useState(false)
  const onShare = () => {
    void navigator.clipboard.writeText(window.location.origin + standaloneSessionPath(shareToken))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      type="button"
      onClick={onShare}
      className="rounded border border-gray-200 px-1.5 text-xs text-gray-500 transition-colors hover:border-blue-300 hover:text-blue-600"
    >
      {copied ? 'copied ✓' : 'share'}
    </button>
  )
}

export const SessionHeader = ({ session, active, onStop, onResume, onRename }: HeaderProps) => {
  const [open, setOpen] = useState(false)
  return (
    <div className="shrink-0 border-b border-gray-200 bg-white px-6 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <SessionName name={session.name} onRename={onRename} />
        {/* Diagnostics (agent kind + session id) duplicate the ⓘ panel below, so
            hide them on phones to keep the row from overflowing. */}
        <span aria-hidden className="hidden text-gray-300 sm:inline">
          ·
        </span>
        <span className="hidden font-mono text-xs text-gray-500 sm:inline">
          {session.agentKind}
        </span>
        <span aria-hidden className="hidden text-gray-300 sm:inline">
          ·
        </span>
        <span className="hidden font-mono text-xs text-gray-500 sm:inline">
          {session.agentSessionId ? truncateUuid(session.agentSessionId) : 'materializing…'}
        </span>
        <span className="hidden sm:inline-flex">
          <CopyButton text={session.agentSessionId ?? ''} />
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-gray-500">
          <span
            className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-gray-300'}`}
          />
          {active ? 'active' : 'inactive'}
        </span>
        {session.shareToken && <ShareButton shareToken={session.shareToken} />}
        {active && (
          <button
            type="button"
            onClick={onStop}
            className="rounded border border-gray-200 px-1.5 text-xs text-gray-500 transition-colors hover:border-amber-300 hover:text-amber-600"
          >
            stop
          </button>
        )}
        {!active && (
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
