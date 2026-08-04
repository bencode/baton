import { type ChildProcess, spawn } from 'node:child_process'
import { defineCommand } from 'citty'
import { killPidGroup } from './proc.ts'

type StartMessage = { type: 'start'; argv: string[]; cwd: string }
type StopMessage = { type: 'stop' }

const isStart = (message: unknown): message is StartMessage => {
  if (typeof message !== 'object' || message === null) return false
  const value = message as Partial<StartMessage>
  return (
    value.type === 'start' &&
    typeof value.cwd === 'string' &&
    Array.isArray(value.argv) &&
    value.argv.length > 0 &&
    value.argv.every(arg => typeof arg === 'string')
  )
}

const isStop = (message: unknown): message is StopMessage =>
  typeof message === 'object' &&
  message !== null &&
  (message as Partial<StopMessage>).type === 'stop'

const send = (message: unknown): void => {
  if (process.connected) process.send?.(message)
}

const runServiceChild = (): void => {
  let app: ChildProcess | null = null
  let killTimer: ReturnType<typeof setTimeout> | null = null
  let stopping = false

  const stop = (): void => {
    if (stopping) return
    stopping = true
    if (!app?.pid) {
      process.exit(0)
      return
    }
    killPidGroup(app.pid)
    killTimer = setTimeout(() => {
      if (app?.pid) killPidGroup(app.pid, 'SIGKILL')
    }, 5_000)
    killTimer.unref()
  }

  process.on('disconnect', stop)
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  process.on('message', message => {
    if (isStop(message)) return stop()
    if (!isStart(message) || app) return
    const [command, ...args] = message.argv
    app = spawn(command ?? '', args, {
      cwd: message.cwd,
      detached: true,
      stdio: 'inherit',
      env: process.env,
    })
    app.once('spawn', () => send({ type: 'started', pid: app?.pid }))
    app.once('error', error => {
      send({ type: 'error', error: error.message })
      process.exit(1)
    })
    app.once('exit', (code, signal) => {
      if (killTimer) clearTimeout(killTimer)
      process.exit(code ?? (signal ? 1 : 0))
    })
  })
}

export const serviceChildCommand = defineCommand({
  meta: { name: 'child', description: 'internal service process wrapper', hidden: true },
  run: runServiceChild,
})
