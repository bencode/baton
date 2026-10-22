import { type PushMessage, toPushMessage } from './push-message.ts'
import type { FinishedTurn, PushSubscriptionRecord, Store } from './store/types.ts'

export type SendPush = (sub: PushSubscriptionRecord, message: PushMessage) => Promise<void>
export type PushNotifierDeps = { store: Pick<Store, 'push'>; send: SendPush }

const TICK_MS = 3_000
const BATCH = 100

// Push services answer 404/410 once a browser drops its subscription.
const isGone = (err: unknown): boolean =>
  typeof err === 'object' &&
  err !== null &&
  'statusCode' in err &&
  (err.statusCode === 404 || err.statusCode === 410)

const notify = async (deps: PushNotifierDeps, turn: FinishedTurn): Promise<void> => {
  const message = toPushMessage(turn)
  if (!message) return
  const subs = await deps.store.push.subscriptionsFor(turn.senderUserIds)
  await Promise.all(
    subs.map(sub =>
      deps.send(sub, message).catch(async (err: unknown) => {
        if (isGone(err)) return deps.store.push.unsubscribe(sub.endpoint)
        console.error('[push] send failed', sub.endpoint, err)
      }),
    ),
  )
}

// One pass over turn-ending events past the cursor. SessionEvent is the durable
// log, so a restart resumes where it stopped; delivery is at most once (a failed
// send is logged, not retried). The first run starts at the newest event so
// history is never replayed.
export const runPushPass = async (deps: PushNotifierDeps): Promise<number> => {
  const cursor = await deps.store.push.cursor()
  if (cursor == null) {
    await deps.store.push.setCursor(await deps.store.push.latestEventId())
    return 0
  }
  const turns = await deps.store.push.finishedTurnsAfter(cursor, BATCH)
  for (const turn of turns) {
    await notify(deps, turn)
    await deps.store.push.setCursor(turn.eventId)
  }
  return turns.length
}

export const startPushNotifier = (
  deps: PushNotifierDeps,
  tickMs: number = TICK_MS,
): { stop: () => void } => {
  let running = false
  const timer = setInterval(() => {
    if (running) return
    running = true
    void runPushPass(deps)
      .catch(err => console.error('[push-notifier] threw', err))
      .finally(() => {
        running = false
      })
  }, tickMs)
  if (typeof timer.unref === 'function') timer.unref()
  return { stop: () => clearInterval(timer) }
}
