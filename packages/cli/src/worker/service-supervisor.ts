import type { ChildProcess } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  ServiceActionResult,
  ServicePresence,
  ServiceReport,
  ServiceSnapshot,
} from '@baton/shared'
import type { WorkerConfig } from '../project-config.ts'
import { killPidGroup } from './proc.ts'
import { workerRuntimeDir } from './runtime-paths.ts'
import { startServiceProcess } from './service-process.ts'

type Entry = {
  wrapper: ChildProcess
  appPid?: number
  cwd: string
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
    cwd: string,
    name: string,
    argv: string[],
    publicUrl?: string,
    note?: string,
  ): Promise<void>
  stop(requestId: string, name: string): Promise<void>
  report(result?: ServiceActionResult): Promise<void>
  killAll(): void
}

export const createServiceSupervisor = (deps: {
  sendReport: (report: ServiceReport) => Promise<unknown>
  cfg: WorkerConfig
  log: (message: string) => void
}): ServiceSupervisor => {
  const { sendReport, cfg, log } = deps
  const entries = new Map<string, Entry>()
  let reportQueue = Promise.resolve()

  const snapshot = (): ServiceSnapshot[] =>
    [...entries.values()]
      .filter(entry => entry.appPid !== undefined)
      .map(({ cwd, name, startedAt, publicUrl, note }) => ({
        cwd,
        name,
        startedAt,
        ...(publicUrl ? { publicUrl } : {}),
        ...(note ? { note } : {}),
      }))

  const report = (result?: ServiceActionResult): Promise<void> => {
    const body = { services: snapshot(), ...(result ? { result } : {}) }
    const request = reportQueue.then(() => sendReport(body)).then(() => {})
    reportQueue = request.catch(error => log(`service report failed: ${String(error)}`))
    return request
  }

  const remove = (entry: Entry): void => {
    if (entries.get(entry.name) !== entry) return
    entries.delete(entry.name)
    void report().catch(error => log(`service removal report failed: ${String(error)}`))
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
    cwd: string,
    name: string,
    argv: string[],
    publicUrl?: string,
    note?: string,
  ): Promise<void> => {
    try {
      if (!(await stat(cwd)).isDirectory())
        return report({ requestId, ok: false, error: `not a directory: ${cwd}`, status: 400 })
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT' && code !== 'ENOTDIR') throw error
      return report({ requestId, ok: false, error: `directory not found: ${cwd}`, status: 400 })
    }
    const logDir = join(workerRuntimeDir(cfg), 'services')
    const logPath = join(logDir, `${name}.log`)
    mkdirSync(logDir, { recursive: true, mode: 0o700 })
    if (entries.has(name))
      return report({
        requestId,
        ok: false,
        error: `service "${name}" is already running`,
        status: 409,
      })
    const { wrapper, started } = startServiceProcess({ argv, cwd, logPath })
    const entry: Entry = {
      wrapper,
      cwd,
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
      cwd,
      name,
      startedAt: entry.startedAt,
      ...(publicUrl ? { publicUrl } : {}),
      ...(note ? { note } : {}),
    }
    log(`service ${name} started in ${cwd}`)
    await report({ requestId, ok: true, service, logPath })
  }

  const run = async (
    requestId: string,
    cwd: string,
    name: string,
    argv: string[],
    publicUrl?: string,
    note?: string,
  ): Promise<void> => {
    try {
      await runOne(requestId, cwd, name, argv, publicUrl, note)
    } catch (error) {
      log(`service ${name} failed: ${String(error)}`)
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

  const killAll = (): void => entries.forEach(stopEntry)

  return { run, stop, report, killAll }
}
