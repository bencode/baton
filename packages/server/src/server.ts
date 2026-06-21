import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { createBusy } from './busy.ts'
import { startBusySweep } from './busy-sweep.ts'
import { createChannelPresence, startPresencePrune } from './channel-presence.ts'
import { createEventBus } from './event-bus.ts'
import type { LivenessTracker } from './liveness.ts'
import { createProjectBus } from './project-bus.ts'
import type { Store } from './store/types.ts'

export type Server = { port: number; stop: () => Promise<void> }

// Run the Hono app on Node via @hono/node-server; stop closes the server, then the
// Store. workerLiveness is optional — createApp() instantiates its own if omitted.
// Channel presence is owned here (so its prune sweep is started + stopped with the
// server lifecycle), then injected into the app.
export const startServer = (opts: {
  store: Store
  port: number
  workerLiveness?: LivenessTracker
}): Promise<Server> =>
  new Promise(resolve => {
    const presence = createChannelPresence()
    const presencePrune = startPresencePrune(presence)
    // Own the session event bus, busy tracker, and project bus here so the busy
    // sweep can share the exact instances the app mutates (else it'd sweep an
    // empty second tracker). createApp injection is positional.
    const bus = createEventBus()
    const busy = createBusy()
    const projects = createProjectBus()
    const app = createApp(
      opts.store,
      bus,
      opts.workerLiveness,
      undefined,
      busy,
      undefined,
      undefined,
      projects,
      undefined,
      undefined,
      presence,
    )
    // Close turns whose worker went silent past the TTL (the "stuck thinking"
    // safety net), started + stopped with the server lifecycle like the prune.
    const busySweep = startBusySweep({ store: opts.store, bus, projects, busy })
    const httpServer = serve({ fetch: app.fetch, port: opts.port }, info => {
      resolve({
        port: info.port,
        stop: () =>
          new Promise<void>((res, rej) => {
            httpServer.close(err => (err ? rej(err) : res()))
          }).then(() => {
            presencePrune.stop()
            busySweep.stop()
            return opts.store.close()
          }),
      })
    })
  })
