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
    })
    assert.equal(r1.code, 'R-1')
    assert.equal(r1.status, 'active')
    const r2 = await ctx.store.requirements.create({ projectId: p.id, title: 'next' })
    assert.equal(r2.code, 'R-2')
    const got = await ctx.store.requirements.get(r1.id)
    assert.deepEqual(got?.resources, [{ kind: 'doc', uri: 'docs/login.md', label: 'spec' }])
  })

  test('requirement: markdown body round-trips on create and update', async () => {
    const w = await ctx.store.workspaces.create({ name: 'w' })
    const p = await ctx.store.projects.create({ workspaceId: w.id, name: 'p' })
    const r = await ctx.store.requirements.create({
      projectId: p.id,
      title: 'x',
      body: '## goal\n- a\n- b',
    })
    assert.equal((await ctx.store.requirements.get(r.id))?.body, '## goal\n- a\n- b')
    const updated = await ctx.store.requirements.update(r.id, { body: '# changed' })
    assert.equal(updated.body, '# changed')
  })

  test('requirement.update advances product-dimension status', async () => {
    const w = await ctx.store.workspaces.create({ name: 'w' })
    const p = await ctx.store.projects.create({ workspaceId: w.id, name: 'p' })
    const r = await ctx.store.requirements.create({ projectId: p.id, title: 'x' })
    const updated = await ctx.store.requirements.update(r.id, { status: 'done' })
    assert.equal(updated.status, 'done')
  })

  test('external ref: round-trips, relinks, and rejects a duplicate link', async () => {
    const w = await ctx.store.workspaces.create({ name: 'w' })
    const p = await ctx.store.projects.create({ workspaceId: w.id, name: 'p' })
    const ext = { source: 'github' as const, number: 42, url: 'https://github.com/o/r/issues/42' }
    const r = await ctx.store.requirements.create({ projectId: p.id, title: 'x', external: ext })
    assert.deepEqual((await ctx.store.requirements.get(r.id))?.external, ext)
    // relink (overwrite) is allowed; a patch without external leaves it untouched
    const relinked = await ctx.store.requirements.update(r.id, {
      external: { ...ext, number: 43, url: 'https://github.com/o/r/issues/43' },
    })
    assert.equal(relinked.external?.number, 43)
    assert.equal((await ctx.store.requirements.update(r.id, { title: 'y' })).external?.number, 43)
    // one issue maps to at most one requirement per project (unique constraint)
    await assert.rejects(
      ctx.store.requirements.create({
        projectId: p.id,
        title: 'dup',
        external: { ...ext, number: 43 },
      }),
    )
  })
})
