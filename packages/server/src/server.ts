import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { createBusy } from './busy.ts'
import { startBusySweep } from './busy-sweep.ts'
import { createChannelPresence, startPresencePrune } from './channel-presence.ts'
import { createCommandBus } from './command-bus.ts'
import { createEventBus } from './event-bus.ts'
import { startLoopScheduler } from './loop-scheduler.ts'
import { createProjectBus } from './project-bus.ts'
import { createSessionRuntime } from './session-runtime.ts'
import type { Store } from './store/types.ts'
import { createTerminalBridge } from './terminal-bridge.ts'
import { startTerminalReaper } from './terminal-reaper.ts'

export type Server = { port: number; stop: () => Promise<void> }

// Run the Hono app on Node via @hono/node-server; stop closes the server, then the
// Store. Channel presence is owned here (so its prune sweep is started + stopped
// with the server lifecycle), then injected into the app.
export const startServer = (opts: { store: Store; port: number }): Promise<Server> =>
  new Promise(resolve => {
    const presence = createChannelPresence()
    const presencePrune = startPresencePrune(presence)
    // Own the session event bus, busy tracker, and project bus here so the busy
    // sweep can share the exact instances the app mutates (else it'd sweep an
    // empty second tracker). createApp injection is positional.
    const bus = createEventBus()
    const busy = createBusy()
    const projects = createProjectBus()
    // Hoisted (like bus/busy/projects) so the Loop scheduler shares the exact
    // runtime + command bus the app mutates — else it'd check an empty second
    // tracker and never see a connected worker.
    const runtime = createSessionRuntime()
    const commands = createCommandBus()
    // Hoisted so the idle-reaper shares the exact terminal bridge the WS routes
    // mutate. `injectWs` is captured during createApp (@hono/node-ws needs the http
    // server, only known after serve) and called post-serve.
    const terminal = createTerminalBridge()
    let injectWs: ((server: ReturnType<typeof serve>) => void) | undefined
    const app = createApp(
      opts.store,
      bus,
      runtime,
      busy,
      undefined,
      commands,
      projects,
      undefined,
      undefined,
      presence,
      terminal,
      inject => {
        injectWs = inject
      },
    )
    // Close turns whose worker went silent past the TTL (the "stuck thinking"
    // safety net), started + stopped with the server lifecycle like the prune.
    const busySweep = startBusySweep({ store: opts.store, bus, projects, busy })
    // Recurring scheduled wake-ups (Loop): every tick, send due loops' messages
    // through the same path an interactive send takes. BATON_LOOP_TICK_MS overrides
    // the 30s default (tests). Unref'd; stopped with the lifecycle.
    const loopScheduler = startLoopScheduler(
      { store: opts.store, bus, commands, runtime, projects },
      Number(process.env.BATON_LOOP_TICK_MS) || undefined,
    )
    // Recycle interactive terminals nobody is viewing (frees pty slots).
    const terminalReaper = startTerminalReaper({ bridge: terminal, store: opts.store, projects })
    const httpServer = serve({ fetch: app.fetch, port: opts.port }, info => {
      resolve({
        port: info.port,
        stop: () =>
          new Promise<void>((res, rej) => {
            httpServer.close(err => (err ? rej(err) : res()))
          }).then(() => {
            presencePrune.stop()
            busySweep.stop()
            loopScheduler.stop()
            terminalReaper.stop()
            return opts.store.close()
          }),
      })
    })
    // Wire the WS upgrade handler onto the http server (the terminal bridge).
    injectWs?.(httpServer)
  })
