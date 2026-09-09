import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createClient } from '@libsql/client'
import { createPrisma } from './db/client.ts'
import { backfillSessionInputs } from './session-input-backfill.ts'
import { createPrismaStore } from './store/prisma-store.ts'

test('offline backfill preserves history identities/highwater, pauses old inputs and is idempotent', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'baton-backfill-'))
  const url = `file:${join(dir, 'test.db')}`
  const setup = createClient({ url })
  const migrations = new URL('../prisma/migrations/', import.meta.url)
  for (const name of (await readdir(migrations))
    .filter(name => name !== 'migration_lock.toml')
    .sort())
    await setup.executeMultiple(
      await readFile(new URL(`${name}/migration.sql`, migrations), 'utf8'),
    )
  setup.close()
  const prisma = createPrisma(url)
  const store = createPrismaStore(prisma)
  try {
    const workspace = await store.workspaces.create({ name: 'w' })
    const project = await store.projects.create({ workspaceId: workspace.id, name: 'p' })
    const worker = await store.workers.register({
      projectId: project.id,
      machineId: 'm',
      name: 'n',
      hostname: 'h',
    })
    assert.notEqual(worker.kind, 'name-collision')
    if (worker.kind === 'name-collision') throw new Error('unexpected collision')
    const session = await store.sessions.create({
      projectId: project.id,
      workerId: worker.worker.id,
      mode: 'worker',
      name: 's',
      agentKind: 'claude-code',
    })
    const historical = await store.sessions.appendEvent(session.id, 'user_message', {
      text: 'executed',
      loopId: 11,
    })
    await store.sessions.appendEvent(session.id, 'turn_start', { messageId: historical.id })
    // Preflight rejects an unfinished legacy turn without changing any data.
    await assert.rejects(backfillSessionInputs(prisma, true), /unfinished legacy turn/)
    assert.equal(await prisma.sessionPendingInput.count(), 0)
    await store.sessions.appendEvent(session.id, 'turn_complete', {})
    const oldExecuted = await store.sessions.appendEvent(session.id, 'user_message', {
      text: 'old',
      loopId: 11,
    })
    const latestExecuted = await store.sessions.appendEvent(session.id, 'user_message', {
      text: 'latest executed',
      loopId: 11,
    })
    await store.sessions.appendEvent(session.id, 'turn_start', { messageId: latestExecuted.id })
    await store.sessions.appendEvent(session.id, 'turn_complete', {})
    const oldCancelled = await store.sessions.appendEvent(session.id, 'user_message', {
      text: 'old',
      loopId: 22,
    })
    const latestCancelled = await store.sessions.appendEvent(session.id, 'user_message', {
      text: 'latest cancelled',
      loopId: 22,
    })
    await store.sessions.appendEvent(session.id, 'message_cancelled', {
      messageId: latestCancelled.id,
    })
    const cancelled = await store.sessions.appendEvent(session.id, 'user_message', {
      text: 'cancelled',
    })
    await store.sessions.appendEvent(session.id, 'message_cancelled', { messageId: cancelled.id })
    const oldQueued = await store.sessions.appendEvent(session.id, 'user_message', {
      text: 'old',
      loopId: 33,
    })
    const queued = await store.sessions.appendEvent(session.id, 'user_message', {
      text: 'pending',
      loopId: 33,
      planMode: true,
      model: 'opus',
      effort: 'high',
      images: ['image'],
    })
    const manual = await store.sessions.appendEvent(session.id, 'user_message', { text: 'pending' })
    await prisma.session.update({ where: { id: session.id }, data: { nextEventSequence: 0 } })
    assert.deepEqual(await backfillSessionInputs(prisma), {
      sessions: 1,
      pending: 2,
      cancelled: 2,
      superseded: 3,
      applied: false,
    })
    assert.equal(await prisma.sessionPendingInput.count(), 0)
    assert.deepEqual(await backfillSessionInputs(prisma, true), {
      sessions: 1,
      pending: 2,
      cancelled: 2,
      superseded: 3,
      applied: true,
    })
    assert.equal((await store.turns.state(session.id)).paused, true)
    const pending = await store.inputs.list(session.id)
    assert.deepEqual(
      pending.items.map(input => [
        input.text,
        input.planMode,
        input.model,
        input.effort,
        input.images,
      ]),
      [
        ['pending', true, 'opus', 'high', ['image']],
        ['pending', false, null, null, []],
      ],
    )
    const history = await store.sessions.listEvents(session.id)
    assert.deepEqual(history[0], historical)
    assert.deepEqual(
      history.find(event => event.id === latestExecuted.id),
      latestExecuted,
    )
    assert.equal(
      history.some(event =>
        [
          queued.id,
          cancelled.id,
          manual.id,
          oldExecuted.id,
          oldCancelled.id,
          latestCancelled.id,
          oldQueued.id,
        ].includes(event.id),
      ),
      false,
    )
    const next = await store.sessions.appendEvent(session.id, 'system', { action: 'test' })
    assert.equal(next.sequence, manual.sequence + 1)
    assert.deepEqual(await backfillSessionInputs(prisma, true), {
      sessions: 1,
      pending: 0,
      cancelled: 0,
      superseded: 0,
      applied: true,
    })
    assert.equal((await store.inputs.list(session.id)).items.length, 2)
    const replacement = await store.inputs.submit(session.id, { text: 'replacement', loopId: 33 })
    assert.deepEqual(
      replacement.value.queue.items.map(input => input.text),
      ['pending', 'replacement'],
    )
    assert.equal(replacement.value.queue.items[0]?.id, pending.items[1]?.id)
  } finally {
    await store.close()
    await rm(dir, { recursive: true, force: true })
  }
})
