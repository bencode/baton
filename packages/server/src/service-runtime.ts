import type { Id, ServiceActionResult, ServicePresence, ServiceSnapshot } from '@baton/shared'

const DEFAULT_TTL_MS = 180_000
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000

type Entry = ServicePresence & { expiresAt: number }
type Pending = {
  resolve: (result: ServiceActionResult) => void
  timer: ReturnType<typeof setTimeout>
}

export type ServiceRuntime = {
  replace(workerId: Id, services: ServiceSnapshot[], now?: number): void
  listWorker(workerId: Id, now?: number): ServicePresence[]
  listWorkers(workerIds: Id[], now?: number): ServicePresence[]
  expect(requestId: string): Promise<ServiceActionResult>
  resolve(result: ServiceActionResult): void
  prune(now?: number): number
}

export const createServiceRuntime = (
  ttlMs = DEFAULT_TTL_MS,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
): ServiceRuntime => {
  const workers = new Map<Id, Map<string, Entry>>()
  const pending = new Map<string, Pending>()

  const freshWorker = (workerId: Id, now: number): Map<string, Entry> | undefined => {
    const entries = workers.get(workerId)
    if (!entries) return undefined
    for (const [name, entry] of entries) if (entry.expiresAt <= now) entries.delete(name)
    if (entries.size === 0) workers.delete(workerId)
    return entries.size > 0 ? entries : undefined
  }

  return {
    replace(workerId, services, now = Date.now()) {
      if (services.length === 0) {
        workers.delete(workerId)
        return
      }
      workers.set(
        workerId,
        new Map(
          services.map(service => [service.name, { ...service, workerId, expiresAt: now + ttlMs }]),
        ),
      )
    },
    listWorker(workerId, now = Date.now()) {
      return [...(freshWorker(workerId, now)?.values() ?? [])].map(
        ({ expiresAt: _expiresAt, ...service }) => service,
      )
    },
    listWorkers(workerIds, now = Date.now()) {
      return workerIds.flatMap(workerId =>
        [...(freshWorker(workerId, now)?.values() ?? [])].map(
          ({ expiresAt: _expiresAt, ...service }) => service,
        ),
      )
    },
    expect(requestId) {
      return new Promise(resolve => {
        const timer = setTimeout(() => {
          pending.delete(requestId)
          resolve({
            requestId,
            ok: false,
            error: 'worker did not acknowledge the service command in time',
            status: 504,
          })
        }, requestTimeoutMs)
        if (typeof timer.unref === 'function') timer.unref()
        pending.set(requestId, { resolve, timer })
      })
    },
    resolve(result) {
      const waiter = pending.get(result.requestId)
      if (!waiter) return
      clearTimeout(waiter.timer)
      pending.delete(result.requestId)
      waiter.resolve(result)
    },
    prune(now = Date.now()) {
      let removed = 0
      for (const [workerId, entries] of workers) {
        for (const [name, entry] of entries)
          if (entry.expiresAt <= now) {
            entries.delete(name)
            removed += 1
          }
        if (entries.size === 0) workers.delete(workerId)
      }
      return removed
    },
  }
}

export const startServicePrune = (
  runtime: ServiceRuntime,
  intervalMs = 60_000,
): { stop: () => void } => {
  const timer = setInterval(() => runtime.prune(), intervalMs)
  if (typeof timer.unref === 'function') timer.unref()
  return { stop: () => clearInterval(timer) }
}
