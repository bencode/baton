import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { createChannelPresence, startPresencePrune } from './channel-presence.ts'
import type { LivenessTracker } from './liveness.ts'
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
    // createApp injection is positional; presence is the last param.
    const app = createApp(
      opts.store,
      undefined,
      opts.workerLiveness,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      presence,
    )
    const httpServer = serve({ fetch: app.fetch, port: opts.port }, info => {
      resolve({
        port: info.port,
        stop: () =>
          new Promise<void>((res, rej) => {
            httpServer.close(err => (err ? rej(err) : res()))
          }).then(() => {
            presencePrune.stop()
            return opts.store.close()
          }),
      })
    })
  })
