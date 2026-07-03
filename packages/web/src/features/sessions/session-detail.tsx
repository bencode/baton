import { type Attachment, type Id, isPlaceholderSessionName } from '@baton/shared'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useApi } from '../../app/api-context'
import { renamePasted } from '../../utils/attachment'
import { pendingMessages, reduceEvents } from './event-render'
import { CommandHelp } from './session-detail/command-menu'
import type { SlashCommand } from './session-detail/commands'
import { Composer } from './session-detail/composer'
import { ConnectionBanner } from './session-detail/connection-banner'
import { EventStream } from './session-detail/event-stream'
import { QueuedMessages } from './session-detail/queued-messages'
import { SessionHeader } from './session-detail/session-header'
import { TerminalView } from './session-detail/terminal-view'
import { useTranscriptScroll } from './session-detail/use-transcript-scroll'
import { WorkingIndicator } from './session-detail/working-indicator'
import { useSessionStream } from './use-session-stream'
import { useSession, useSessions } from './use-sessions'

type SessionDetailProps = { sessionId: Id }

// Auto-title retries on each completed turn while a session is still unnamed —
// give up after this many so a session that never gains substance isn't asked
// forever (the user can always rename by hand).
const MAX_AUTOTITLE_ATTEMPTS = 5

// Render a Session as a chat. Looks up the session by int id; the list query
// from `useSessions` re-polls so we can use its fresher copy when available.
export const SessionDetail = ({ sessionId }: SessionDetailProps) => {
  const api = useApi()
  const { data: sessionShallow } = useSession(sessionId)
  // projectId comes from the session itself, so this body works keyed by
  // sessionId alone — reused by both the in-app tab and the standalone /s/:token page.
  const projectId = sessionShallow?.projectId ?? null
  const { data: liveSessions } = useSessions(projectId)
  const session = liveSessions?.find(s => s.id === sessionId) ?? sessionShallow
  const { events, status, hasOlder, loadingOlder, loadOlder } = useSessionStream(
    session?.id ?? null,
  )
  const items = useMemo(
    () => reduceEvents(events, { agentKind: session?.agentKind }),
    [events, session?.agentKind],
  )
  const queued = useMemo(() => pendingMessages(events), [events])
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [showHelp, setShowHelp] = useState(false)

  // Stick-to-bottom + jump-to-latest + load-earlier scroll handling (see hook).
  const { scrollRef, pinned, onScroll, jumpToBottom, markPrepend } = useTranscriptScroll(
    sessionId,
    items.length,
  )
  // Record the reading position before fetching older events so it doesn't jump.
  const onLoadOlder = () => {
    markPrepend()
    loadOlder()
  }

  // Auto-title trigger: while the session is still a placeholder, ask the worker
  // to title it after each completed turn (it reads its own transcript and may
  // decline if there's not enough yet). Retry on new turns up to a cap, so a
  // session that starts trivial but turns substantial gets named later; once a
  // real name sticks the placeholder check stops it.
  const autoTitle = useRef({ sid: null as Id | null, firedTurns: 0, attempts: 0, inFlight: false })
  useEffect(() => {
    const a = autoTitle.current
    if (a.sid !== sessionId) {
      a.sid = sessionId
      a.firedTurns = 0
      a.attempts = 0
      a.inFlight = false
    }
    if (!session || a.inFlight || a.attempts >= MAX_AUTOTITLE_ATTEMPTS) return
    if (!isPlaceholderSessionName(session.name)) return
    const turns = events.reduce((n, e) => (e.type === 'turn_complete' ? n + 1 : n), 0)
    if (turns <= a.firedTurns) return
    a.firedTurns = turns
    a.attempts += 1
    a.inFlight = true
    void api.sessions.autotitle(sessionId).finally(() => {
      autoTitle.current.inFlight = false
    })
  }, [events, session, sessionId, api])

  if (!session) return <div className="p-6 text-sm text-gray-400">loading…</div>

  // Upload the batch concurrently; append every success and surface a count of
  // any failures instead of silently dropping the rest of the batch. Files
  // pasted from the clipboard often have an empty name — give them one.
  const addFiles = async (files: File[]) => {
    if (files.length === 0) return
    setUploading(true)
    setUploadError(null)
    try {
      const results = await Promise.allSettled(
        files.map((file, i) =>
          api.sessions.uploadAttachment(sessionId, file.name ? file : renamePasted(file, i)),
        ),
      )
      const ok = results.flatMap(r => (r.status === 'fulfilled' ? [r.value] : []))
      if (ok.length > 0) setAttachments(prev => [...prev, ...ok])
      const failed = results.length - ok.length
      if (failed > 0) setUploadError(`${failed} file(s) failed to upload`)
    } finally {
      setUploading(false)
    }
  }

  const removeAttachment = (id: string) =>
    // The orphaned server blob is transient (cascade-cleaned on session destroy); fine for v0.
    setAttachments(prev => prev.filter(a => a.id !== id))

  const send = async (textOverride?: string) => {
    const text = (textOverride ?? draft).trim()
    if (!text && attachments.length === 0) return
    setSending(true)
    setSendError(null)
    try {
      await api.sessions.sendMessage(sessionId, text, attachments)
      setDraft('')
      setAttachments([])
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // 409 = session not active (worker child not running). Surface, don't swallow.
      setSendError(
        msg.includes('409') ? 'Session not active — resume it to send' : 'Send failed — try again',
      )
    } finally {
      setSending(false)
    }
  }

  // Lifecycle control: the 2s session poll refreshes `attached` after these land.
  const resume = () => {
    setSendError(null)
    void api.sessions.resume(sessionId).catch(() => {})
  }
  const stop = () => void api.sessions.stop(sessionId).catch(() => {})
  // Open / close the interactive terminal. session.terminalOpen flips true (via the
  // project stream) once the worker's pty WS bridges, which renders <TerminalView>.
  const openTerminal = () =>
    void api.sessions.openTerminal(sessionId).catch(err => console.error('open terminal', err))
  const closeTerminal = () =>
    void api.sessions.closeTerminal(sessionId).catch(err => console.error('close terminal', err))
  // Interrupt the in-flight turn (the 停止 button + /abort); session stays alive.
  const abort = () => void api.sessions.abort(sessionId).catch(() => {})
  // Rename propagates back via the project stream (rail/tab/header all refetch).
  const rename = (name: string) => void api.sessions.rename(sessionId, name).catch(() => {})

  // Toggle the session-wide read-only plan mode. Persisted server-side; the new
  // flag rides back over the project stream (session.planMode), so the badge and
  // every client stay in sync. Shift+Tab in the composer hits the same path.
  const togglePlanMode = () =>
    void api.sessions.setMode(sessionId, !session.planMode).catch(() => {})

  // Set/reset the session's model override. Persisted server-side like planMode;
  // rides back over the project stream (session.model), and the server stamps it
  // onto each user_message → the runner passes it to the SDK's options.model.
  const setModel = (model: string | null) =>
    void api.sessions.setModel(sessionId, model).catch(err => console.error('set model', err))

  // Slash command from the composer. /clear resets context (the server appends a
  // notice the transcript renders); /help opens the command list; /plan toggles
  // read-only plan mode (server persists it → worker runs each turn in the SDK's
  // permissionMode:'plan' until toggled back); /model <name> overrides the model
  // (bare /model resets to the default).
  const runCommand = (command: SlashCommand, args: string) => {
    if (command.kind === 'clear') void api.sessions.clear(sessionId).catch(() => {})
    else if (command.kind === 'abort') abort()
    else if (command.kind === 'help') setShowHelp(true)
    else if (command.kind === 'plan') togglePlanMode()
    else if (command.kind === 'model') setModel(args || null)
  }

  // Show the breathing indicator while a turn is open. Trust the server's `busy`
  // — the single source of truth: it already folds in `attached`, an open turn,
  // AND a liveness TTL, so a dead/wedged worker's turn stops looking busy on its
  // own (no more "stuck thinking forever"). `sending` covers the brief optimistic
  // window before our user_message round-trips back over SSE and flips busy true.
  const working = sending || session.busy

  return (
    <div className="flex h-full min-w-0 flex-col">
      <SessionHeader
        session={session}
        active={session.attached}
        projectId={session.projectId}
        activeLoops={session.activeLoops}
        terminalOpen={session.terminalOpen}
        onStop={stop}
        onResume={resume}
        onOpenTerminal={openTerminal}
        onCloseTerminal={closeTerminal}
        onRename={rename}
      />
      <ConnectionBanner streamStatus={status} connected={session.connected} />
      {/* A terminal IS the interaction surface — it fills the body; the relay
          transcript + composer (which the server rejects while a terminal is open)
          are hidden. Close via the header's "close terminal". */}
      {session.terminalOpen ? (
        <TerminalView sessionId={session.id} />
      ) : (
        <>
          <EventStream
            items={items}
            scrollRef={scrollRef}
            working={working}
            onScroll={onScroll}
            pinned={pinned}
            onJumpToBottom={jumpToBottom}
            hasOlder={hasOlder}
            loadingOlder={loadingOlder}
            onLoadOlder={onLoadOlder}
          />
          {working && <WorkingIndicator onAbort={abort} />}
          <QueuedMessages queued={queued} />
          {showHelp && (
            <div className="shrink-0 bg-white px-3">
              <CommandHelp onClose={() => setShowHelp(false)} />
            </div>
          )}
          <Composer
            draft={draft}
            setDraft={setDraft}
            attachments={attachments}
            onAddFiles={files => void addFiles(files)}
            onRemoveAttachment={removeAttachment}
            uploading={uploading}
            uploadError={uploadError}
            sending={sending}
            active={session.attached}
            sendError={sendError}
            onSend={() => void send()}
            onCommand={runCommand}
            planMode={session.planMode}
            onTogglePlanMode={togglePlanMode}
            model={session.model}
            onResetModel={() => setModel(null)}
          />
        </>
      )}
    </div>
  )
}
