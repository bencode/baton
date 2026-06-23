import { Hono } from 'hono'
import { type AttachmentStore, createAttachmentStore, defaultAttachmentDir } from './attachments.ts'
import { type BusyTracker, createBusy } from './busy.ts'
import { type ChannelBus, createChannelBus } from './channel-bus.ts'
import { type ChannelPresence, createChannelPresence } from './channel-presence.ts'
import { type CommandBus, createCommandBus } from './command-bus.ts'
import { createEventBus, type EventBus } from './event-bus.ts'
import { cookieAuth } from './middleware/cookie-auth.ts'
import { createProjectBus, type ProjectBus } from './project-bus.ts'
import { createRelayBus, type RelayBus } from './relay-bus.ts'
import { registerAdminRoutes } from './routes/admin.ts'
import { registerAuthRoutes } from './routes/auth.ts'
import { registerChannelRoutes } from './routes/channels.ts'
import { registerLoopRoutes } from './routes/loops.ts'
import { registerProjectRoutes } from './routes/projects.ts'
import { registerRelayRoutes } from './routes/relay.ts'
import { registerRequirementRoutes } from './routes/requirements.ts'
import { registerSessionAttachmentRoutes } from './routes/session-attachments.ts'
import { registerSessionRoutes } from './routes/sessions.ts'
import { registerTaskRoutes } from './routes/tasks.ts'
import { registerWorkerRoutes } from './routes/workers.ts'
import { registerWorkspaceRoutes } from './routes/workspaces.ts'
import { createSessionRuntime, type SessionRuntime } from './session-runtime.ts'
import type { Store } from './store/types.ts'
import type { AppEnv } from './views.ts'

export type { AppEnv } from './views.ts'

// HTTP surface, sliced by resource. Each routes/<X>.ts attaches its handlers
// to the shared Hono app so route paths stay flat (no /v1 prefix gymnastics).
//
// In-memory trackers — no DB persistence; all "right now":
//   runtime        — per-session active flag set by the worker via
//                    POST /sessions/:id/status, cleared on worker-stream drop.
//                    Source of `attached`.
//   busyTracker    — keyed by sessionId; toggled by POST /sessions/:id/events on
//                    turn_start (true) / turn_complete / turn_error (false).
//   commands       — server→worker command bus (session.start/stop/delete).
export const createApp = (
  store: Store,
  bus: EventBus = createEventBus(),
  runtime: SessionRuntime = createSessionRuntime(),
  busyTracker: BusyTracker = createBusy(),
  attachments: AttachmentStore = createAttachmentStore(defaultAttachmentDir()),
  commands: CommandBus = createCommandBus(),
  projects: ProjectBus = createProjectBus(),
  relay: RelayBus = createRelayBus(),
  channelBus: ChannelBus = createChannelBus(),
  presence: ChannelPresence = createChannelPresence(),
): Hono<AppEnv> => {
  const app = new Hono<AppEnv>()
  app.get('/health', c => c.json({ ok: true }))
  // /health + /auth + /relay + /channels are registered before the gate so they
  // stay public; everything below is behind the cookie gate (enforced iff a user
  // exists), except the worker-bearer routes isExempt carves out. Relay and
  // channels self-authenticate with a per-channel token — their own auth domain,
  // decoupled from baton's.
  registerAuthRoutes(app, store)
  registerRelayRoutes(app, relay)
  registerChannelRoutes(app, store, channelBus, presence, attachments)
  app.use('*', cookieAuth(store))
  registerWorkspaceRoutes(app, store)
  registerProjectRoutes(app, store, runtime, busyTracker, projects, commands)
  registerRequirementRoutes(app, store)
  registerTaskRoutes(app, store, projects)
  registerWorkerRoutes(app, store, commands, runtime, projects)
  registerAdminRoutes(app, store, runtime, busyTracker, commands)
  registerSessionRoutes(app, store, bus, runtime, busyTracker, attachments, commands, projects)
  registerSessionAttachmentRoutes(app, store, attachments)
  registerLoopRoutes(app, store, projects)
  return app
}
