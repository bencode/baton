import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { newCtx, type ContractCtx } from './helpers.ts'

describe('Store artifacts', () => {
  let ctx: ContractCtx
  beforeEach(async () => {
    ctx = await newCtx()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('create/list/key lookup and project cascade', async () => {
    const workspace = await ctx.store.workspaces.create({ name: 'w' })
    const project = await ctx.store.projects.create({ workspaceId: workspace.id, name: 'p' })
    const artifact = await ctx.store.artifacts.create({
      projectId: project.id,
      key: 'abc123',
      storageId: 'storage-1',
      filename: 'report.pdf',
      contentType: 'application/pdf',
      size: 42,
    })
    assert.equal((await ctx.store.artifacts.getByKey('abc123'))?.id, artifact.id)
    assert.deepEqual(
      (await ctx.store.artifacts.listByProject(project.id)).map(item => item.id),
      [artifact.id],
    )
    await ctx.store.projects.delete(project.id)
    assert.equal(await ctx.store.artifacts.get(artifact.id), null)
  })
})
