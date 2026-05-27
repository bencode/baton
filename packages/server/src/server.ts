import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import type { Store } from './store/types.ts'

export type Server = { port: number; stop: () => Promise<void> }

// Run the Hono app on Node via @hono/node-server; stop closes the server, then the Store.
export const startServer = (opts: { store: Store; port: number }): Promise<Server> =>
  new Promise(resolve => {
    const app = createApp(opts.store)
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
