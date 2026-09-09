import { execFile } from 'node:child_process'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
export const RUNNER_RECORD = '.baton-runner.json'
export type RunnerRecord = {
  server: string
  workerId: number
  sessionId: number
  runnerToken: string
  pid: number
  pgid: number
}
const recordPath = (worktreePath: string): string => join(worktreePath, RUNNER_RECORD)
const codeOf = (error: unknown): unknown =>
  typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined

export const readRunnerRecord = async (worktreePath: string): Promise<RunnerRecord | null> => {
  let raw: string
  try {
    raw = await readFile(recordPath(worktreePath), 'utf8')
  } catch (error) {
    if (codeOf(error) === 'ENOENT') return null
    throw error
  }
  const value = JSON.parse(raw) as Partial<RunnerRecord>
  if (
    typeof value.server !== 'string' ||
    typeof value.runnerToken !== 'string' ||
    !value.runnerToken ||
    !Number.isInteger(value.pid) ||
    (value.pid ?? 0) < 2 ||
    value.pgid !== value.pid ||
    !Number.isInteger(value.workerId) ||
    !Number.isInteger(value.sessionId)
  )
    throw new Error('invalid session process record')
  return value as RunnerRecord
}

export const writeRunnerRecord = async (
  worktreePath: string,
  record: RunnerRecord,
): Promise<void> => {
  const path = recordPath(worktreePath)
  const temporary = `${path}.${record.runnerToken}.tmp`
  await writeFile(temporary, JSON.stringify(record), { mode: 0o600, flag: 'wx' })
  await rename(temporary, path)
}

const groupExists = (pgid: number): boolean => {
  try {
    process.kill(-pgid, 0)
    return true
  } catch (error) {
    if (codeOf(error) === 'ESRCH') return false
    throw error
  }
}
const signalGroup = (pgid: number, signal: NodeJS.Signals): void => {
  try {
    process.kill(-pgid, signal)
  } catch (error) {
    if (codeOf(error) !== 'ESRCH') throw error
  }
}

export const stopRecordedRunner = async (
  record: RunnerRecord,
  expected: Pick<RunnerRecord, 'server' | 'workerId' | 'sessionId'>,
  graceMs = 5_000,
): Promise<void> => {
  if (
    record.server !== expected.server ||
    record.workerId !== expected.workerId ||
    record.sessionId !== expected.sessionId
  )
    throw new Error('session process record belongs to a different worker')
  if (!groupExists(record.pgid)) return
  let stdout: string
  try {
    const result = await run('ps', ['-ww', '-p', String(record.pid), '-o', 'pgid=', '-o', 'args='])
    stdout = result.stdout
  } catch (error) {
    if (!groupExists(record.pgid)) return
    throw error
  }
  const parts = stdout.trim().split(/\s+/)
  const marker = parts.indexOf('--runner-token')
  if (Number(parts[0]) !== record.pgid || marker < 0 || parts[marker + 1] !== record.runnerToken)
    throw new Error('cannot verify old session process identity')
  signalGroup(record.pgid, 'SIGTERM')
  const deadline = Date.now() + graceMs
  while (groupExists(record.pgid) && Date.now() < deadline)
    await new Promise(resolve => setTimeout(resolve, 50))
  if (!groupExists(record.pgid)) return
  signalGroup(record.pgid, 'SIGKILL')
  const killDeadline = Date.now() + graceMs
  while (groupExists(record.pgid) && Date.now() < killDeadline)
    await new Promise(resolve => setTimeout(resolve, 50))
  if (groupExists(record.pgid)) throw new Error('session process group has not exited')
}
