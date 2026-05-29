import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { type ContractCtx, newCtx, seedReq } from './helpers.ts'

describe('Store contract — workers', () => {
  let ctx: ContractCtx
  beforeEach(async () => {
    ctx = await newCtx()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('worker register: rule 2a creates a fresh worker', async () => {
    const { project } = await seedReq(ctx)
    const out = await ctx.store.workers.register({
      projectId: project,
      machineId: 'mid-1',
      name: 'ben-laptop',
      hostname: 'bens-air.local',
    })
    assert.equal(out.kind, 'created')
    if (out.kind !== 'created') throw new Error('unreachable')
    assert.equal(out.worker.machineId, 'mid-1')
    assert.equal(out.worker.name, 'ben-laptop')
  })

  test('worker register: rule 1 reattaches by machineId; can update name on the fly', async () => {
    const { project } = await seedReq(ctx)
    await ctx.store.workers.register({
      projectId: project,
      machineId: 'mid-1',
      name: 'ben-laptop',
      hostname: 'bens-air.local',
    })
    const again = await ctx.store.workers.register({
      projectId: project,
      machineId: 'mid-1',
      name: 'ben-laptop-renamed',
      hostname: 'bens-air.local',
    })
    assert.equal(again.kind, 'reattached-machine')
    if (again.kind !== 'reattached-machine') throw new Error('unreachable')
    assert.equal(again.worker.name, 'ben-laptop-renamed')
    // Only one worker row exists in this project (no soft delete anymore)
    const list = await ctx.store.workers.listByProject(project)
    assert.equal(list.length, 1)
  })

  test('worker register: rule 2c rejects name collision from a different machine', async () => {
    const { project } = await seedReq(ctx)
    await ctx.store.workers.register({
      projectId: project,
      machineId: 'mid-1',
      name: 'shared-name',
      hostname: 'host-a',
    })
    const collide = await ctx.store.workers.register({
      projectId: project,
      machineId: 'mid-2',
      name: 'shared-name',
      hostname: 'host-b',
    })
    assert.equal(collide.kind, 'name-collision')
  })

  test('worker destroy: same machineId can register again afterward as a new row', async () => {
    const { project } = await seedReq(ctx)
    const a = await ctx.store.workers.register({
      projectId: project,
      machineId: 'mid-1',
      name: 'ben',
      hostname: 'h',
    })
    if (a.kind !== 'created') throw new Error('unreachable')
    await ctx.store.workers.destroy(a.worker.id)
    const b = await ctx.store.workers.register({
      projectId: project,
      machineId: 'mid-1',
      name: 'ben',
      hostname: 'h',
    })
    assert.equal(b.kind, 'created')
    if (b.kind !== 'created') throw new Error('unreachable')
    assert.notEqual(a.worker.id, b.worker.id)
    // findByMachine resolves the new row
    const found = await ctx.store.workers.findByMachine(project, 'mid-1')
    assert.equal(found?.id, b.worker.id)
  })
})
