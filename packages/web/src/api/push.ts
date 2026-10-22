import { request, type Url } from './request'

// Web Push subscriptions for the logged-in user. publicKey is null when the
// server has no VAPID keys configured (push disabled).
export type PushApi = {
  config(): Promise<{ publicKey: string | null }>
  subscribe(sub: PushSubscriptionJSON): Promise<void>
  unsubscribe(endpoint: string): Promise<void>
}

export const pushApi = (u: Url): PushApi => ({
  config: () => request(u('/push/config'), { method: 'GET' }),
  subscribe: async sub => {
    await request(u('/push/subscriptions'), { method: 'POST', body: sub })
  },
  unsubscribe: async endpoint => {
    await request(u('/push/subscriptions'), { method: 'DELETE', body: { endpoint } })
  },
})
