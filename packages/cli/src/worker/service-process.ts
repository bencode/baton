import { type ChildProcess, spawn } from 'node:child_process'
import { closeSync, existsSync, openSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const START_TIMEOUT_MS = 10_000

type WrapperMessage = { type: 'started'; pid: number } | { type: 'error'; error: string }

const isWrapperMessage = (message: unknown): message is WrapperMessage => {
  if (typeof message !== 'object' || message === null) return false
  const value = message as { type?: string; pid?: unknown; error?: unknown }
  if (value.type === 'started') return typeof value.pid === 'number'
  return value.type === 'error' && typeof value.error === 'string'
}

const binPath = (): string => {
  const here = dirname(fileURLToPath(import.meta.url))
  const devShim = join(here, '..', '..', 'bin', 'baton.mjs')
  return existsSync(devShim) ? devShim : fileURLToPath(import.meta.url)
}

export type StartingServiceProcess = {
  wrapper: ChildProcess
  started: Promise<number>
}

export const startServiceProcess = (input: {
  argv: string[]
  cwd: string
  logPath: string
}): StartingServiceProcess => {
  const logFd = openSync(input.logPath, 'a')
  let wrapper: ChildProcess
  try {
    wrapper = spawn(process.execPath, [binPath(), 'service', 'child'], {
      detached: false,
      stdio: ['ignore', logFd, logFd, 'ipc'],
      env: process.env,
    })
  } finally {
    closeSync(logFd)
  }

  const started = new Promise<number>((resolve, reject) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout>
    const cleanup = (): void => {
      clearTimeout(timer)
      wrapper.off('message', onMessage)
      wrapper.off('error', onError)
      wrapper.off('exit', onExit)
    }
    const finish = (result: number | Error): void => {
      if (settled) return
      settled = true
      cleanup()
      if (result instanceof Error) reject(result)
      else resolve(result)
    }
    const onMessage = (message: unknown): void => {
      if (!isWrapperMessage(message)) return
      if (message.type === 'started') finish(message.pid)
      else finish(new Error(message.error))
    }
    const onError = (error: Error): void => finish(error)
    const onExit = (code: number | null): void =>
      finish(new Error(`service wrapper exited before start (code=${code ?? -1})`))

    wrapper.on('message', onMessage)
    wrapper.once('error', onError)
    wrapper.once('exit', onExit)
    timer = setTimeout(() => {
      if (wrapper.connected) wrapper.send({ type: 'stop' })
      finish(new Error('service wrapper did not start in time'))
    }, START_TIMEOUT_MS)
    timer.unref()
    wrapper.send({ type: 'start', argv: input.argv, cwd: input.cwd }, error => {
      if (error) finish(error)
    })
  })

  return { wrapper, started }
}
