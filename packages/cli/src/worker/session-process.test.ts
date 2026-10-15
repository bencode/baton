import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { sessionRuntimeDir } from './runtime-paths.ts'
import {
  type RunnerRecord,
  readRunnerRecord,
  stopRecordedRunner,
  writeRunnerRecord,
} from './session-process.ts'

test('record roundtrip, identity mismatch fails closed, confirmed group stop is idempotent', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'baton-process-test-'))
  const runnerToken = randomUUID()
  const child = spawn(
    process.execPath,
    [
      '-e',
      'process.send("ready"); setInterval(() => {}, 1000)',
      '--',
      '--runner-token',
      runnerToken,
    ],
    { detached: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] },
  )
  const exited = once(child, 'exit')
  try {
    await once(child, 'message')
    assert.ok(child.pid)
    const record: RunnerRecord = {
      server: 'http://test',
      workerId: 1,
      sessionId: 2,
      runnerToken,
      pid: child.pid,
      pgid: child.pid,
    }
    assert.equal(await readRunnerRecord(dir), null)
    await writeRunnerRecord(dir, record)
    assert.deepEqual(await readRunnerRecord(dir), record)
    await assert.rejects(
      stopRecordedRunner(record, { ...record, workerId: 999 }),
      /different worker/,
    )
    await assert.rejects(stopRecordedRunner({ ...record, runnerToken: 'wrong' }, record), /verify/)
    assert.doesNotThrow(() => process.kill(record.pid, 0))
    await stopRecordedRunner(record, record, 500)
    await exited
    assert.throws(() => process.kill(-record.pgid, 0), { code: 'ESRCH' })
    await stopRecordedRunner(record, record, 500)
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
      await exited
    }
    await rm(dir, { recursive: true, force: true })
  }
})

test('runner records cannot overwrite another server or Worker with the same Session id', async () => {
  const root = await mkdtemp(join(tmpdir(), 'baton-process-scope-'))
  const owners = [
    { server: 'http://local', workerId: 1 },
    { server: 'https://remote.example', workerId: 1 },
    { server: 'http://local', workerId: 2 },
  ]
  try {
    for (const [index, owner] of owners.entries()) {
      const dir = sessionRuntimeDir(owner, 7, { XDG_DATA_HOME: root })
      await mkdir(dir, { recursive: true })
      await writeRunnerRecord(dir, {
        ...owner,
        sessionId: 7,
        runnerToken: `runner-${index}`,
        pid: 100 + index,
        pgid: 100 + index,
      })
    }
    for (const [index, owner] of owners.entries()) {
      const record = await readRunnerRecord(sessionRuntimeDir(owner, 7, { XDG_DATA_HOME: root }))
      assert.equal(record?.runnerToken, `runner-${index}`)
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
