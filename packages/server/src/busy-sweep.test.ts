import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createBusy } from './busy.ts'
import { sweepExpired } from './busy-sweep.ts'
import { createCommandBus } from './command-bus.ts'
import { createEventBus } from './event-bus.ts'
import { createProjectBus } from './project-bus.ts'
import { newCtx, seedReq, seedWorker } from './store/contract/helpers.ts'

test('sweep requests stop once and wakes recovery from persisted state, not a memory tracker', async () => {
  const ctx = await newCtx()
  try {
    const { project } = await seedReq(ctx)
    const workerId = await seedWorker(ctx, project)
    const session = await ctx.store.sessions.create({
      projectId: project,
      workerId,
      mode: 'worker',
      agentKind: 'codex',
      name: 's',
    })
    await ctx.store.sessions.materialize(session.id, {
      agentSessionId: 'pending:a',
      worktreePath: '/tmp/s',
    })
    await ctx.store.inputs.submit(session.id, { text: 'run' })
    const claim = await ctx.store.turns.claim(session.id, { claimId: 'c', runnerToken: 'r' })
    assert.equal(claim.value.kind, 'execute')
    if (claim.value.kind !== 'execute') throw new Error('expected claim')
    const commands = createCommandBus()
    const notifications: string[] = []
    const unsubscribe = commands.subscribe(workerId, command => notifications.push(command.cmd))
    const bus = createEventBus()
    const events: string[] = []
    const unlisten = bus.subscribe(session.id, event => events.push(event.type))
    const deps = {
      store: ctx.store,
      busy: createBusy(),
      commands,
      bus,
      projects: createProjectBus(),
    }
    await sweepExpired(deps, claim.value.attempt.leaseUntil + 1)
    await sweepExpired(deps, claim.value.attempt.leaseUntil + 2)
    assert.deepEqual(events, ['system'])
    assert.deepEqual(notifications, ['session.reconcile', 'session.reconcile'])
    const state = await ctx.store.turns.state(session.id)
    assert.equal(state.attempt?.status, 'stopping')
    assert.equal(state.turn?.status, 'running')
    assert.equal(
      (await ctx.store.sessions.listEvents(session.id)).some(event => event.type === 'turn_error'),
      false,
    )
    unsubscribe()
    unlisten()
  } finally {
    await ctx.cleanup()
  }
})
