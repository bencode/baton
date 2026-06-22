import type { Hono } from 'hono'
import type { AttachmentStore } from '../attachments.ts'
import type { BusyTracker } from '../busy.ts'
import type { CommandBus } from '../command-bus.ts'
import type { EventBus } from '../event-bus.ts'
import type { ProjectBus } from '../project-bus.ts'
import type { SessionRuntime } from '../session-runtime.ts'
import type { Store } from '../store/types.ts'
import type { AppEnv } from '../views.ts'
import { registerSessionControl } from './sessions/control.ts'
import { createSessionCtx } from './sessions/helpers.ts'
import { registerSessionIo } from './sessions/io.ts'
import { registerSessionLifecycle } from './sessions/lifecycle.ts'

// The /sessions/* HTTP surface, split into cohesive groups that share one
// derived context (see ./sessions/helpers.ts):
//   lifecycle — create / read / materialize / resume / stop / rename / delete
//   control   — status / clear / mode / model / abort / autotitle
//   io        — event ingress / chat / history read / live stream
// Signature is unchanged so app.ts wiring stays put.
export const registerSessionRoutes = (
  app: Hono<AppEnv>,
  store: Store,
  bus: EventBus,
  runtime: SessionRuntime,
  busyTracker: BusyTracker,
  attachments: AttachmentStore,
  commands: CommandBus,
  projects: ProjectBus,
): void => {
  const ctx = createSessionCtx({
    store,
    bus,
    runtime,
    busyTracker,
    attachments,
    commands,
    projects,
  })
  registerSessionLifecycle(app, ctx)
  registerSessionControl(app, ctx)
  registerSessionIo(app, ctx)
}
