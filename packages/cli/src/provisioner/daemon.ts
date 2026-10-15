import type { ProvisionerSignal, WorkerCreation } from '@baton/shared'
import { EventSource } from 'eventsource'
import { HttpError } from '../client/request.ts'
import { createProvisionerClient, type ProvisionerClient } from './client.ts'
import type { ProvisionerConfig } from './config.ts'
import { provisionWorker } from './executor.ts'
import { workerLogPath } from './launchd.ts'

const taskError = (error: unknown, config: ProvisionerConfig): string => {
  const message = error instanceof Error ? error.message : 'unknown creation error'
  return [config.token, ...Object.values(config.workerEnv)]
    .filter(value => value.length > 0)
    .reduce((safe, secret) => safe.replaceAll(secret, '[redacted]'), message)
}

const processCreation = async (
  id: number,
  config: ProvisionerConfig,
  client: ProvisionerClient,
  signal: AbortSignal,
): Promise<void> => {
  let creation: WorkerCreation
  try {
    creation = await client.get(id, signal)
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      console.error(`[provisioner] creation ${id} no longer exists`)
      return
    }
    throw error
  }
  if (creation.status === 'succeeded' || creation.status === 'failed') return
  if (creation.status === 'running') {
    await client.report(
      id,
      {
        status: 'failed',
        error: 'Provisioner interrupted; inspect retained resources before creating again',
      },
      signal,
    )
    return
  }
  try {
    await provisionWorker(config, creation, client, signal)
  } catch (error) {
    if (signal.aborted) {
      console.error(`[provisioner] creation ${id} interrupted: ${taskError(error, config)}`)
      return
    }
    if (!(error instanceof HttpError) || ![401, 403].includes(error.status)) {
      const message = `${taskError(error, config)}; worker log: ${workerLogPath(creation)}`
      console.error(`[provisioner] creation ${id}: ${message}`)
      await client.report(id, { status: 'failed', error: message }, signal)
      return
    }
    throw error
  }
}

export const runProvisioner = async (
  config: ProvisionerConfig,
  signal: AbortSignal,
): Promise<void> => {
  const client = createProvisionerClient(config)
  const abort = new AbortController()
  const queued = new Set<number>()
  let tail = Promise.resolve()
  let fatal: unknown
  let finish = (): void => {}
  const ended = new Promise<void>(resolve => {
    finish = resolve
  })
  const stream = new EventSource(`${config.server}/provisioner/stream`, {
    fetch: (url, init) =>
      fetch(url, {
        ...init,
        headers: { ...init?.headers, authorization: `Bearer ${config.token}` },
        signal: abort.signal,
      }),
  })
  const stop = (): void => {
    stream.close()
    abort.abort()
    finish()
  }
  const fail = (error: unknown): void => {
    fatal = error
    console.error(`[provisioner] ${taskError(error, config)}`)
    stop()
  }
  stream.onmessage = event => {
    try {
      const message = JSON.parse(event.data) as ProvisionerSignal
      if (
        !message ||
        !Number.isSafeInteger(message.creationId) ||
        message.creationId <= 0 ||
        !['create', 'inspect'].includes(message.action)
      )
        throw new Error('invalid provisioner signal')
      if (queued.has(message.creationId)) return
      queued.add(message.creationId)
      tail = tail
        .then(async () => {
          try {
            if (!abort.signal.aborted)
              await processCreation(message.creationId, config, client, abort.signal)
          } finally {
            queued.delete(message.creationId)
          }
        })
        .catch(error => {
          if (!abort.signal.aborted) fail(error)
          else console.error(`[provisioner] stopped: ${taskError(error, config)}`)
        })
    } catch (error) {
      fail(error)
    }
  }
  stream.onerror = event => {
    if (stream.readyState === EventSource.CLOSED || [401, 403, 409].includes(event.code ?? 0))
      fail(new Error(`provisioner stream rejected: HTTP ${event.code}`))
    else
      console.error(`[provisioner] stream disconnected (${event.code ?? 'network'}); reconnecting`)
  }
  signal.addEventListener('abort', stop, { once: true })
  if (signal.aborted) stop()
  console.log('[provisioner] waiting for worker creation requests')
  try {
    await ended
    await tail
  } finally {
    stop()
    signal.removeEventListener('abort', stop)
  }
  if (fatal !== undefined) throw new Error(taskError(fatal, config))
}
