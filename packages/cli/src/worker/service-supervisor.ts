import type { ChildProcess } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type {
  Id,
  ServiceActionResult,
  ServicePresence,
  ServiceReport,
  ServiceSnapshot,
} from '@baton/shared'
import type { WorkerConfig } from '../project-config.ts'
import { killPidGroup } from './proc.ts'
import { startServiceProcess } from './service-process.ts'

type Entry = {
  wrapper: ChildProcess
  appPid?: number
  sessionId: Id
  name: string
  startedAt: number
  publicUrl?: string
  note?: string
}

const waitForExit = (child: ChildProcess): Promise<void> =>
  child.exitCode !== null
    ? Promise.resolve()
    : new Promise(resolve => child.once('exit', () => resolve()))

export type ServiceSupervisor = {
  run(
    requestId: string,
    sessionId: Id,
    name: string,
    argv: string[],
    publicUrl?: string,
    note?: string,
  ): Promise<void>
  stop(requestId: string, name: string): Promise<void>
  stopSession(sessionId: Id): Promise<void>
  report(result?: ServiceActionResult): Promise<void>
  killAll(): void
}

export const createServiceSupervisor = (deps: {
  getSession: (sessionId: Id) => Promise<{ workerId: Id; worktreePath: string | null }>
  sendReport: (report: ServiceReport) => Promise<unknown>
  cfg: WorkerConfig
  log: (message: string) => void
}): ServiceSupervisor => {
  const { getSession, sendReport, cfg, log } = deps
  const entries = new Map<string, Entry>()
  let reportQueue = Promise.resolve()

  const snapshot = (): ServiceSnapshot[] =>
    [...entries.values()]
      .filter(entry => entry.appPid !== undefined)
      .map(({ sessionId, name, startedAt, publicUrl, note }) => ({
        sessionId,
        name,
        startedAt,
        ...(publicUrl ? { publicUrl } : {}),
        ...(note ? { note } : {}),
      }))

  const report = (result?: ServiceActionResult): Promise<void> => {
    const body = { services: snapshot(), ...(result ? { result } : {}) }
    const request = reportQueue.then(() => sendReport(body)).then(() => {})
    reportQueue = request.catch(() => {})
    return request
  }

  const remove = (entry: Entry): void => {
    if (entries.get(entry.name) !== entry) return
    entries.delete(entry.name)
    void report().catch(() => {})
  }

  const stopEntry = (entry: Entry): void => {
    if (entry.wrapper.connected) {
      entry.wrapper.send({ type: 'stop' })
      return
    }
    if (entry.appPid) killPidGroup(entry.appPid, 'SIGKILL')
  }

  const runOne = async (
    requestId: string,
    sessionId: Id,
    name: string,
    argv: string[],
    publicUrl?: string,
    note?: string,
  ): Promise<void> => {
    if (entries.has(name))
      return report({
        requestId,
        ok: false,
        error: `service "${name}" is already running`,
        status: 409,
      })
    const session = await getSession(sessionId)
    if (session.workerId !== cfg.workerId || !session.worktreePath)
      return report({
        requestId,
        ok: false,
        error: 'session is not materialized on this worker',
        status: 400,
      })

    const logDir = join(session.worktreePath, '.baton-services')
    const logPath = join(logDir, `${name}.log`)
    mkdirSync(logDir, { recursive: true })
    const { wrapper, started } = startServiceProcess({ argv, cwd: session.worktreePath, logPath })
    const entry: Entry = {
      wrapper,
      sessionId,
      name,
      startedAt: Date.now(),
      publicUrl,
      note,
    }
    entries.set(name, entry)
    wrapper.once('exit', code => {
      log(`service ${name} exited (code=${code ?? -1})`)
      remove(entry)
    })

    try {
      entry.appPid = await started
    } catch (error) {
      remove(entry)
      return report({ requestId, ok: false, error: String(error), status: 500 })
    }
    const service: ServicePresence = {
      workerId: cfg.workerId,
      sessionId,
      name,
      startedAt: entry.startedAt,
      ...(publicUrl ? { publicUrl } : {}),
      ...(note ? { note } : {}),
    }
    log(`service ${name} started in ${session.worktreePath}`)
    await report({ requestId, ok: true, service, logPath })
  }

  const run = async (
    requestId: string,
    sessionId: Id,
    name: string,
    argv: string[],
    publicUrl?: string,
    note?: string,
  ): Promise<void> => {
    try {
      await runOne(requestId, sessionId, name, argv, publicUrl, note)
    } catch (error) {
      await report({ requestId, ok: false, error: String(error), status: 500 })
    }
  }

  const stop = async (requestId: string, name: string): Promise<void> => {
    const entry = entries.get(name)
    if (!entry)
      return report({ requestId, ok: false, error: `service "${name}" not found`, status: 404 })
    stopEntry(entry)
    await waitForExit(entry.wrapper)
    remove(entry)
    await report({ requestId, ok: true })
  }

  const stopSession = async (sessionId: Id): Promise<void> => {
    const matches = [...entries.values()].filter(entry => entry.sessionId === sessionId)
    matches.forEach(stopEntry)
    await Promise.all(matches.map(entry => waitForExit(entry.wrapper)))
    matches.forEach(remove)
  }

  const killAll = (): void => entries.forEach(stopEntry)

  return { run, stop, stopSession, report, killAll }
}
