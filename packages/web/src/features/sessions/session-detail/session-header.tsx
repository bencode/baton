import type { Id, Session } from '@baton/shared'
import { useState } from 'react'
import { standaloneSessionPath } from '../../../app/route'
import { CopyIcon, InfoIcon } from '../../../components/icons'
import { copyText } from '../../../utils/clipboard'
import { LoopsControl } from '../../loops/loops-control'

// SessionHeader — one-line identity strip, gritty enough that the rest of the
// surface stays a quiet reading area. Diagnostic info (cwd, full agent UUID)
// is folded behind a single ⓘ toggle so they don't dominate every refresh.
//
// `active` reflects whether the worker has a live child for this session
// (instant via SessionView.attached); browser-SSE health lives in the banner.
type HeaderProps = {
  session: Session
  active: boolean
  projectId: Id
  activeLoops: number
  terminalOpen: boolean
  onStop: () => void
  onResume: () => void
  onOpenTerminal: () => void
  onCloseTerminal: () => void
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
        className="ui-focus min-h-11 max-w-64 truncate rounded text-[13px] font-semibold tracking-tight text-ui-text decoration-dotted hover:underline md:min-h-8 [@media(pointer:coarse)]:min-h-11"
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
      className="ui-input w-40 font-semibold md:w-48"
    />
  )
}

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false)
  const onCopy = () => {
    copyText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      type="button"
      onClick={onCopy}
      className="ui-icon-button"
      aria-label="copy agent session id"
      title={copied ? 'copied' : 'copy agent session id'}
    >
      {copied ? '✓' : <CopyIcon />}
    </button>
  )
}

// Copy the standalone collaboration link (/s/:token) — same URL the DingTalk /
// Feishu bots push. Anyone with the link can read the transcript and write into
// the session (share token logs the visitor in with full permissions).
const ShareButton = ({ shareToken }: { shareToken: string }) => {
  const [copied, setCopied] = useState(false)
  const onShare = () => {
    copyText(window.location.origin + standaloneSessionPath(shareToken))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button type="button" aria-label="share" onClick={onShare} className="ui-quiet-button">
      {copied ? 'copied ✓' : 'share'}
    </button>
  )
}

export const SessionHeader = ({
  session,
  active,
  projectId,
  activeLoops,
  terminalOpen,
  onStop,
  onResume,
  onOpenTerminal,
  onCloseTerminal,
  onRename,
}: HeaderProps) => {
  const [open, setOpen] = useState(false)
  const terminalReady =
    session.agentKind !== 'codex' ||
    (session.agentSessionId !== null &&
      !session.agentSessionId.startsWith('pending:') &&
      session.cwd !== null)
  return (
    <div className="shrink-0 border-b border-ui-border bg-ui-surface px-3 py-2 md:px-6">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
        <SessionName name={session.name} onRename={onRename} />
        <span className="text-xs text-ui-muted">{session.agentKind}</span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-ui-muted">
          <span
            className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-ui-success' : 'bg-ui-border'}`}
          />
          {active ? 'active' : 'inactive'}
        </span>
        {active && (
          <button type="button" onClick={onStop} className="ui-quiet-button ui-danger">
            stop
          </button>
        )}
        {/* Hidden while a terminal is open: the terminal owns the session, so the
            server rejects a headless resume anyway (close it first). */}
        {!active && !terminalOpen && (
          <button type="button" onClick={onResume} className="ui-button ui-primary">
            resume
          </button>
        )}
        {/* Interactive terminal — a hands-on alternative to the headless resume.
            Open only while idle (an active headless child would fight it over the
            session); once open it stays as a "close" toggle regardless. */}
        {terminalOpen ? (
          <button
            type="button"
            onClick={onCloseTerminal}
            className="ui-button border-ui-accent-border bg-ui-selected text-ui-selected-text"
          >
            close terminal
          </button>
        ) : (
          !active &&
          terminalReady && (
            <button type="button" onClick={onOpenTerminal} className="ui-quiet-button">
              terminal
            </button>
          )
        )}
        {session.shareToken && <ShareButton shareToken={session.shareToken} />}
        {/* Divider sets loops (recurring automation) apart from the lifecycle /
            share actions; desktop-only so phone wrapping never orphans it. */}
        <span aria-hidden className="hidden h-4 w-px self-center bg-ui-border md:inline-block" />
        <LoopsControl sessionId={session.id} projectId={projectId} activeLoops={activeLoops} />
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="ui-icon-button"
          aria-expanded={open}
          aria-label={open ? 'hide details' : 'show details'}
        >
          <InfoIcon />
        </button>
      </div>
      {open && (
        <div className="mt-2 flex flex-col gap-1 break-all rounded-md bg-ui-panel p-3 font-mono text-xs text-ui-muted">
          <span>cwd: {session.cwd ?? '(pending materialize)'}</span>
          <div className="flex items-center gap-2">
            <span>
              agent session: <span>{session.agentSessionId ?? '(pending materialize)'}</span>
            </span>
            {session.agentSessionId !== null && <CopyButton text={session.agentSessionId} />}
          </div>
        </div>
      )}
    </div>
  )
}
