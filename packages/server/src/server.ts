import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import type { LivenessTracker } from './liveness.ts'
import type { Store } from './store/types.ts'

export type Server = { port: number; stop: () => Promise<void> }

// Run the Hono app on Node via @hono/node-server; stop closes the server, then the Store.
// Both liveness trackers are optional — createApp() will instantiate its own if omitted.
export const startServer = (opts: {
  store: Store
  port: number
  workerLiveness?: LivenessTracker
}): Promise<Server> =>
  new Promise(resolve => {
    const app = createApp(opts.store, undefined, opts.workerLiveness)
    const httpServer = serve({ fetch: app.fetch, port: opts.port }, info => {
      resolve({
        port: info.port,
        stop: () =>
          new Promise<void>((res, rej) => {
            httpServer.close(err => (err ? rej(err) : res()))
          }).then(() => opts.store.close()),
      })
    })
  })
