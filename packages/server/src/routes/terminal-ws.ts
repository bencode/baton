import type { Hono } from 'hono'
import type { UpgradeWebSocket } from 'hono/ws'
import type { EventBus } from '../event-bus.ts'
import { workerBearerAuth } from '../middleware/auth.ts'
import { loadScopedSession } from '../middleware/domain-scope.ts'
import type { ProjectBus } from '../project-bus.ts'
import type { Store } from '../store/types.ts'
import type { TerminalBridge } from '../terminal-bridge.ts'
import { type AppEnv, intParam } from '../views.ts'

const asString = (data: unknown): string =>
  typeof data === 'string' ? data : data instanceof Buffer ? data.toString('utf8') : String(data)

// The interactive-terminal WebSocket bridge. Two endpoints, both riding the
// worker's existing trust model, with the server as a dumb byte pipe between them:
//   /workers/me/terminal/ws?sessionId=  — the worker's pty side (worker bearer).
//     worker → server messages are raw pty output → fan out to viewers.
//   /sessions/:id/terminal/ws            — a browser viewer (cookie + domain scope).
//     viewer → server messages are framed input/resize JSON → forwarded to the pty.
// The browser only connects once SessionView.terminalOpen is true (the worker's pty
// side has attached), so a viewer never races ahead of the pty.
export const registerTerminalWsRoutes = (
  app: Hono<AppEnv>,
  deps: {
    upgradeWebSocket: UpgradeWebSocket
    bridge: TerminalBridge
    store: Store
    projects: ProjectBus
    bus: EventBus
  },
): void => {
  const { upgradeWebSocket, bridge, store, projects, bus } = deps
  const bump = async (sessionId: number): Promise<void> => {
    const s = await store.sessions.get(sessionId)
    if (s) projects.publish(s.projectId, { resource: 'sessions' })
  }
  // A `system` breadcrumb marks the human-takeover window in the transcript — the
  // interactive turns bypass baton's event log (claude writes only its own JSONL),
  // so these boundaries are what explain the gap once the terminal closes.
  const breadcrumb = async (sessionId: number, action: 'terminal_open' | 'terminal_close') => {
    const ev = await store.sessions.appendEvent(sessionId, 'system', { action })
    bus.publish(sessionId, ev)
  }

  // Worker pty side (worker-bearer; carved out of the cookie gate by isExempt).
  app.get(
    '/workers/me/terminal/ws',
    workerBearerAuth(store),
    upgradeWebSocket(c => {
      const worker = c.get('worker')
      const sessionId = intParam(c.req.query('sessionId') ?? '')
      return {
        async onOpen(_evt, ws) {
          const s = await store.sessions.get(sessionId)
          if (!s || !worker || s.workerId !== worker.id) return ws.close(1008, 'not owner')
          bridge.attachWorker(sessionId, worker.id, ws)
          projects.publish(s.projectId, { resource: 'sessions' }) // web → terminalOpen=true
          void breadcrumb(sessionId, 'terminal_open')
        },
        onMessage(evt, _ws) {
          bridge.toViewers(sessionId, asString(evt.data)) // raw pty output → viewers
        },
        onClose(_evt, ws) {
          bridge.detach(sessionId, ws) // pty side gone → terminal closed
          void bump(sessionId)
          void breadcrumb(sessionId, 'terminal_close')
        },
      }
    }),
  )

  // Browser viewer (cookie-gated; scope-guarded before the upgrade).
  app.get(
    '/sessions/:id/terminal/ws',
    async (c, next) => {
      const s = await loadScopedSession(c, store, intParam(c.req.param('id') ?? ''))
      if (s instanceof Response) return s
      await next()
    },
    upgradeWebSocket(c => {
      const sessionId = intParam(c.req.param('id') ?? '')
      return {
        onOpen(_evt, ws) {
          if (!bridge.attachViewer(sessionId, ws)) ws.close(1011, 'terminal not open')
        },
        onMessage(evt, _ws) {
          bridge.toWorker(sessionId, asString(evt.data)) // framed input/resize → pty
        },
        onClose(_evt, ws) {
          bridge.detach(sessionId, ws)
        },
      }
    }),
  )
}
