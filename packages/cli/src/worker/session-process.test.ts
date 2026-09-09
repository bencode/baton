import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
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
    ['-e', 'setInterval(() => {}, 1000)', '--', '--runner-token', runnerToken],
    { detached: true, stdio: 'ignore' },
  )
  const exited = once(child, 'exit')
  try {
    await once(child, 'spawn')
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
