import webpush from 'web-push'
import type { VapidConfig } from './push-config.ts'
import type { SendPush } from './push-notifier.ts'

export const createPushSender =
  (vapid: VapidConfig): SendPush =>
  async (sub, message) => {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(message),
      {
        TTL: 3600,
        vapidDetails: {
          subject: vapid.subject,
          publicKey: vapid.publicKey,
          privateKey: vapid.privateKey,
        },
      },
    )
  }
