import type { Id, Session } from '@baton/shared'
import { useState } from 'react'
import { InfoIcon } from '../../../components/icons'
import { useIsMobile } from '../../../hooks/use-media-query'
import { LoopsControl } from '../../loops/loops-control'
import type { StreamState } from '../use-session-stream'
import { MobileSessionActions, SessionDiagnostics, ShareButton } from './session-header-actions'

// SessionHeader — one-line identity strip, gritty enough that the rest of the
// surface stays a quiet reading area. Diagnostic info (cwd, full agent UUID)
// is folded behind a single ⓘ toggle so they don't dominate every refresh.
//
// `active` reflects whether the worker has a live child for this session
// (instant via SessionView.attached); browser-SSE health lives in the banner.
type HeaderProps = {
  session: Session
  active: boolean
  busy: boolean
  connected: boolean
  streamStatus: StreamState['status']
  initialEvent?: { model?: string; sessionId?: string }
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
        title="重命名会话"
        onClick={() => {
          setDraft(name)
          setEditing(true)
        }}
        className="ui-focus min-h-11 max-w-64 truncate rounded text-[13px] font-semibold tracking-tight text-ui-text decoration-dotted hover:underline md:min-h-7 [@media(pointer:coarse)]:min-h-11"
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
      aria-label="会话名称"
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

export const SessionHeader = ({
  session,
  active,
  busy,
  connected,
  streamStatus,
  initialEvent,
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
  const isMobile = useIsMobile()
  const statusLabel =
    streamStatus !== 'open'
      ? '状态待同步'
      : !connected
        ? '执行环境离线'
        : terminalOpen
          ? '终端中'
          : busy
            ? '执行中'
            : '空闲'
  const terminalReady =
    session.agentKind !== 'codex' ||
    (session.agentSessionId !== null &&
      !session.agentSessionId.startsWith('pending:') &&
      session.cwd !== null)
  if (isMobile)
    return (
      <div className="chat-session-header">
        <div className="chat-mobile-title">
          <SessionName name={session.name} onRename={onRename} />
        </div>
        <div className="chat-mobile-bar">
          <div className="chat-mobile-status">
            <span className="chat-mobile-agent">
              {session.agentKind === 'codex' ? 'Codex' : 'Claude Code'}
            </span>
            <span
              aria-hidden="true"
              className={`chat-mobile-status-dot ${streamStatus === 'open' && connected && busy ? 'bg-ui-accent' : 'bg-ui-border'}`}
            />
            <span className="shrink-0">{statusLabel}</span>
          </div>
          <div className="chat-mobile-primary-actions">
            {terminalOpen ? (
              <button type="button" onClick={onCloseTerminal} className="ui-button">
                关闭终端
              </button>
            ) : active ? (
              <button type="button" onClick={onStop} className="ui-quiet-button ui-danger">
                停止进程
              </button>
            ) : (
              <button type="button" onClick={onResume} className="ui-button">
                恢复会话
              </button>
            )}
            <MobileSessionActions
              session={session}
              initialEvent={initialEvent}
              active={active}
              terminalOpen={terminalOpen}
              terminalReady={terminalReady}
              projectId={projectId}
              activeLoops={activeLoops}
              onOpenTerminal={onOpenTerminal}
              onRename={onRename}
            />
          </div>
        </div>
      </div>
    )
  return (
    <div className="chat-session-header">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
        <div className="flex min-w-0 items-center gap-2">
          <SessionName name={session.name} onRename={onRename} />
          <span className="text-xs md:text-[11px] text-ui-muted">
            {session.agentKind === 'codex' ? 'Codex' : 'Claude Code'}
          </span>
        </div>
        <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-1 text-xs">
          <span className="mr-2 inline-flex items-center gap-1.5 text-xs md:text-[11px] text-ui-muted">
            <span
              className={`h-1.5 w-1.5 rounded-full ${streamStatus === 'open' && connected && busy ? 'bg-ui-accent' : 'bg-ui-border'}`}
            />
            {statusLabel}
          </span>
          {active && (
            <button type="button" onClick={onStop} className="ui-quiet-button ui-danger">
              停止进程
            </button>
          )}
          {/* Hidden while a terminal is open: the terminal owns the session, so the
            server rejects a headless resume anyway (close it first). */}
          {!active && !terminalOpen && (
            <button type="button" onClick={onResume} className="ui-button">
              恢复会话
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
              关闭终端
            </button>
          ) : (
            !active &&
            terminalReady && (
              <button type="button" onClick={onOpenTerminal} className="ui-quiet-button">
                终端
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
            aria-label={open ? '收起详情' : '显示详情'}
          >
            <InfoIcon />
          </button>
        </div>
      </div>
      {open && (
        <div className="mt-2">
          <SessionDiagnostics session={session} initialEvent={initialEvent} />
        </div>
      )}
    </div>
  )
}
