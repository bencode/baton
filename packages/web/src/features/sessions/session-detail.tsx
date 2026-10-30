import type { Id } from '@baton/shared'
import { useEffect, useMemo } from 'react'
import { useApi } from '../../app/api-context'
import { reduceEvents } from './event-render'
import { Composer } from './session-detail/composer'
import { ConnectionBanner } from './session-detail/connection-banner'
import { ConversationLoadState, EventStream } from './session-detail/event-stream'
import { QueuedMessages } from './session-detail/queued-messages'
import { SessionHeader } from './session-detail/session-header'
import { TerminalView } from './session-detail/terminal-view'
import { useComposerControls } from './session-detail/use-composer-controls'
import { useComposerDraft } from './session-detail/use-composer-draft'
import { useDraftAttachments } from './session-detail/use-draft-attachments'
import { useTranscriptScroll } from './session-detail/use-transcript-scroll'
import { useSessionQueue } from './use-session-queue'
import { useSessionStream } from './use-session-stream'
import { usePolledSession, useSession, useSessions } from './use-sessions'

// 'share' is the standalone /s/:token page: the caller holds a grant to this one
// session, so nothing project-level is fetched and only reading + sending remain.
type SessionDetailProps = { sessionId: Id; access?: 'member' | 'share' }

const TURN_EVENTS = new Set(['turn_start', 'turn_complete', 'turn_error', 'turn_aborted'])

// Render a Session as a chat. Looks up the session by int id; the list query
// from `useSessions` re-polls so we can use its fresher copy when available.
export const SessionDetail = ({ sessionId, access = 'member' }: SessionDetailProps) => {
  const api = useApi()
  const shared = access === 'share'
  const member = useSession(shared ? null : sessionId)
  const guest = usePolledSession(shared ? sessionId : null)
  const { data, error: sessionError, refresh: refreshSession } = shared ? guest : member
  const sessionShallow = data?.id === sessionId ? data : null
  // projectId comes from the session itself, so this body works keyed by
  // sessionId alone. The share page has no project access: it stays on the
  // polled single session instead of the project list + stream.
  const projectId = shared ? null : (sessionShallow?.projectId ?? null)
  const { data: liveSessions, refresh: refreshList } = useSessions(projectId)
  const refresh = shared ? guest.refresh : refreshList
  const session = liveSessions?.find(s => s.id === sessionId) ?? sessionShallow
  // The share page never mounts a terminal; it keeps the transcript and says why
  // sending is paused.
  const showTerminal = Boolean(session?.terminalOpen) && !shared
  const {
    events,
    status,
    history,
    retryHistory,
    hasOlder,
    loadingOlder,
    loadOlder,
    connectionRevision,
  } = useSessionStream(session?.id ?? null)
  const items = useMemo(
    () => reduceEvents(events, { agentKind: session?.agentKind }),
    [events, session?.agentKind],
  )
  const queueRevision = useMemo(
    () =>
      events.reduce((revision, event) => {
        if (event.type !== 'queue_changed') return revision
        const value = (event.payload as { revision?: unknown } | null)?.revision
        return typeof value === 'number' ? Math.max(revision, value) : revision
      }, -1),
    [events],
  )
  // Without the project stream, a turn boundary is the share page's cue that
  // busy / attached changed.
  const turnRevision = useMemo(
    () => events.reduce((last, e) => (TURN_EVENTS.has(e.type) ? e.sequence : last), -1),
    [events],
  )
  const refreshGuest = guest.refresh
  useEffect(() => {
    if (shared && turnRevision >= 0) refreshGuest()
  }, [shared, turnRevision, refreshGuest])
  const queue = useSessionQueue(session?.id ?? null, queueRevision, connectionRevision)
  const controls = useComposerControls({ session: session ?? null, onRefresh: refresh })
  const attachments = useDraftAttachments(sessionId)
  const draft = useComposerDraft({
    sessionId,
    attachments,
    canSubmit: Boolean(
      session?.connected && !session.terminalOpen && !controls.saving && !controls.pending,
    ),
    resumeBeforeSend: !shared && session?.attached === false,
    onSubmitted: result => queue.applySnapshot(result.queue),
  })

  // Stick-to-bottom + jump-to-latest + load-earlier scroll handling (see hook).
  const { scrollRef, pinned, onScroll, jumpToBottom, markPrepend, onContentLoad } =
    useTranscriptScroll(sessionId, items, Boolean(session) && !showTerminal)
  // Record the reading position before fetching older events so it doesn't jump.
  const onLoadOlder = () => {
    void loadOlder(markPrepend)
  }

  if (!session)
    return (
      <div className="flex h-full min-w-0 flex-col">
        {sessionError ? (
          <ConversationLoadState
            status="error"
            message={`会话加载失败。${sessionError.message}`}
            onRetry={refreshSession}
          />
        ) : (
          <ConversationLoadState status="loading" message="正在加载会话…" />
        )}
      </div>
    )

  const stop = () => void api.sessions.stop(sessionId).catch(controls.reportError)
  // Open / close the interactive terminal. session.terminalOpen flips true (via the
  // project stream) once the worker's pty WS bridges, which renders <TerminalView>.
  const openTerminal = () =>
    void api.sessions.openTerminal(sessionId).catch(err => console.error('open terminal', err))
  const closeTerminal = () =>
    void api.sessions.closeTerminal(sessionId).catch(err => console.error('close terminal', err))
  // Rename propagates back via the project stream (rail/tab/header all refetch).
  const rename = (name: string) =>
    void api.sessions.rename(sessionId, name).catch(controls.reportError)

  const statusKnown = status === 'open' && session.connected
  const initialEvent = items.find(item => item.kind === 'system-header')

  return (
    <div className="flex h-full min-w-0 flex-col">
      {!shared && (
        <SessionHeader
          session={session}
          active={session.attached}
          busy={session.busy}
          connected={session.connected}
          streamStatus={status}
          initialEvent={initialEvent}
          projectId={session.projectId}
          activeLoops={session.activeLoops}
          terminalOpen={session.terminalOpen}
          onStop={stop}
          onResume={() => void controls.resume()}
          onOpenTerminal={openTerminal}
          onCloseTerminal={closeTerminal}
          onRename={rename}
        />
      )}
      <ConnectionBanner streamStatus={status} connected={session.connected} />
      {/* A terminal IS the interaction surface — it fills the body; the relay
          transcript + composer (which the server rejects while a terminal is open)
          are hidden. Close via the header's "close terminal". */}
      {showTerminal ? (
        <TerminalView sessionId={session.id} />
      ) : (
        <>
          <EventStream
            items={items}
            history={history}
            onRetryHistory={() => void retryHistory()}
            scrollRef={scrollRef}
            working={session.busy}
            statusKnown={statusKnown}
            onContentLoad={onContentLoad}
            onScroll={onScroll}
            pinned={pinned}
            onJumpToBottom={jumpToBottom}
            hasOlder={hasOlder}
            loadingOlder={loadingOlder}
            onLoadOlder={onLoadOlder}
          />
          <Composer
            agentKind={session.agentKind}
            session={session}
            statusKnown={statusKnown}
            draft={draft}
            attachments={attachments}
            controls={controls}
            shared={shared}
            queue={
              <QueuedMessages
                queued={queue.items}
                cancelling={queue.cancelling}
                error={queue.error}
                onCancel={shared ? undefined : inputId => void queue.cancel(inputId)}
              />
            }
          />
        </>
      )}
    </div>
  )
}
