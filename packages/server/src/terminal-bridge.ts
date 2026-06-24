import type { Id } from '@baton/shared'
import type { WSContext } from 'hono/ws'

// In-memory bridge for the interactive terminal: per session, the worker's pty
// WebSocket (one) and the browser viewers (many) it fans out to. The server is a
// dumb byte pipe — input strings (viewer → worker) and pty output (worker →
// viewers) flow through untouched; framing lives at the endpoints. Pure runtime
// (like SessionRuntime): the entry's presence IS `terminalOpen`. Because the
// server holds the viewer sockets, idle-reaping (no viewer for a while) is a
// trivial scan — no client heartbeat needed.
type Entry = { workerId: Id; worker: WSContext; viewers: Set<WSContext>; lastViewerAt: number }

export type TerminalBridge = {
  attachWorker(sessionId: Id, workerId: Id, ws: WSContext): void
  attachViewer(sessionId: Id, ws: WSContext): boolean // false ⇒ no pty side, caller closes
  detach(sessionId: Id, ws: WSContext): void // on any WS close
  toWorker(sessionId: Id, data: string): void
  toViewers(sessionId: Id, data: string): void
  isOpen(sessionId: Id): boolean
  closeWorker(sessionId: Id): void // server-initiated close (close button)
  reapIdle(idleMs: number): Id[] // atomically close + return terminals with no viewer this long
  forgetWorker(workerId: Id): Id[] // worker stream dropped → tear down its terminals
}

// Send on a socket that may have left OPEN (closing) before its onClose fired —
// node-ws's send has no readyState guard and throws "WebSocket is not open". A
// throw must not abort a fan-out loop (one dead viewer would starve the rest);
// the socket's onClose will reap it on the next tick.
const safeSend = (ws: WSContext | undefined, data: string): void => {
  try {
    ws?.send(data)
  } catch {
    // socket closing/closed — its onClose will detach it
  }
}

export const createTerminalBridge = (): TerminalBridge => {
  const open = new Map<Id, Entry>()

  const teardown = (sessionId: Id): void => {
    const e = open.get(sessionId)
    if (!e) return
    open.delete(sessionId)
    for (const v of e.viewers) v.close()
    e.worker.close()
  }

  return {
    attachWorker(sessionId, workerId, ws) {
      const prev = open.get(sessionId)
      if (prev && prev.worker !== ws) prev.worker.close() // replace a stale pty side
      open.set(sessionId, {
        workerId,
        worker: ws,
        viewers: prev?.viewers ?? new Set(),
        lastViewerAt: Date.now(),
      })
    },
    attachViewer(sessionId, ws) {
      const e = open.get(sessionId)
      if (!e) return false // pty side not up yet — the web only connects once terminalOpen
      e.viewers.add(ws)
      e.lastViewerAt = Date.now()
      return true
    },
    detach(sessionId, ws) {
      const e = open.get(sessionId)
      if (!e) return
      if (e.worker === ws) {
        // pty side gone (close button, pty exit, worker died) → terminal closed.
        open.delete(sessionId)
        for (const v of e.viewers) v.close()
      } else if (e.viewers.delete(ws)) {
        e.lastViewerAt = Date.now() // start the idle clock from the last viewer leaving
      }
    },
    toWorker(sessionId, data) {
      safeSend(open.get(sessionId)?.worker, data)
    },
    toViewers(sessionId, data) {
      const e = open.get(sessionId)
      if (e) for (const v of e.viewers) safeSend(v, data)
    },
    isOpen(sessionId) {
      return open.has(sessionId)
    },
    closeWorker(sessionId) {
      teardown(sessionId)
    },
    reapIdle(idleMs) {
      // Find AND close in one synchronous pass: a separate find-then-close would
      // let a viewer attach in between and get torn down mid-connect.
      const cutoff = Date.now() - idleMs
      const ids: Id[] = []
      for (const [sid, e] of open)
        if (e.viewers.size === 0 && e.lastViewerAt < cutoff) ids.push(sid)
      for (const sid of ids) teardown(sid)
      return ids
    },
    forgetWorker(workerId) {
      const ids: Id[] = []
      for (const [sid, e] of open) if (e.workerId === workerId) ids.push(sid)
      for (const sid of ids) teardown(sid)
      return ids
    },
  }
}
