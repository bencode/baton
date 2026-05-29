import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { type ContractCtx, newCtx } from './helpers.ts'

describe('Store contract — requirements', () => {
  let ctx: ContractCtx
  beforeEach(async () => {
    ctx = await newCtx()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('requirement: code auto-generated R-N + JSON fields round-trip + default status active', async () => {
    const w = await ctx.store.workspaces.create({ name: 'w' })
    const p = await ctx.store.projects.create({ workspaceId: w.id, name: 'p' })
    const r1 = await ctx.store.requirements.create({
      projectId: p.id,
      title: 'login',
      resources: [{ kind: 'doc', uri: 'docs/login.md', label: 'spec' }],
      tags: ['auth', 'p0'],
    })
    assert.equal(r1.code, 'R-1')
    assert.equal(r1.status, 'active')
    const r2 = await ctx.store.requirements.create({ projectId: p.id, title: 'next' })
    assert.equal(r2.code, 'R-2')
    const got = await ctx.store.requirements.get(r1.id)
    assert.deepEqual(got?.resources, [{ kind: 'doc', uri: 'docs/login.md', label: 'spec' }])
    assert.deepEqual(got?.tags, ['auth', 'p0'])
  })

  test('requirement.update advances product-dimension status', async () => {
    const w = await ctx.store.workspaces.create({ name: 'w' })
    const p = await ctx.store.projects.create({ workspaceId: w.id, name: 'p' })
    const r = await ctx.store.requirements.create({ projectId: p.id, title: 'x' })
    const updated = await ctx.store.requirements.update(r.id, { status: 'done' })
    assert.equal(updated.status, 'done')
  })
})
