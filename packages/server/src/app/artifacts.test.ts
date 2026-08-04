import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, test } from 'node:test'
import type { Artifact } from '@baton/shared'
import { createApp } from '../app.ts'
import { createArtifactFileStore, MAX_ARTIFACT_BYTES } from '../artifacts.ts'
import { freshStore, type TestStore } from '../store/test-db.ts'

describe('server HTTP — project artifacts', () => {
  let ctx: TestStore
  let dataDir: string

  beforeEach(async () => {
    ctx = await freshStore()
    dataDir = mkdtempSync(join(tmpdir(), 'baton-artifact-'))
  })

  afterEach(async () => {
    await ctx.cleanup()
    rmSync(dataDir, { recursive: true, force: true })
  })

  const seed = async () => {
    const workspace = await ctx.store.workspaces.create({ name: 'w' })
    const project = await ctx.store.projects.create({ workspaceId: workspace.id, name: 'p' })
    const other = await ctx.store.projects.create({ workspaceId: workspace.id, name: 'other' })
    const registered = await ctx.store.workers.register({
      projectId: project.id,
      machineId: 'machine',
      name: 'worker',
      hostname: 'host',
    })
    if (registered.kind === 'name-collision') throw new Error('unexpected collision')
    await ctx.store.users.create({ username: 'admin', passwordHash: 'x', isAdmin: true })
    return { project, other, token: registered.apiToken }
  }

  test('worker publishes, lists, previews, downloads, and revokes a project artifact', async () => {
    const { project, token } = await seed()
    const app = createApp(ctx.store, {
      artifactFiles: createArtifactFileStore(dataDir),
    })
    const html = '<!doctype html><title>Report</title><p>ready</p>'
    const published = await app.request(
      `/artifacts?projectId=${project.id}&filename=${encodeURIComponent('../report.html')}`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'text/html' },
        body: html,
      },
    )
    assert.equal(published.status, 201)
    const artifact = (await published.json()) as Artifact
    assert.equal(artifact.key.length, 12)
    assert.equal(artifact.filename, 'report.html')
    assert.equal(artifact.url, `http://localhost/a/${artifact.key}`)

    const listed = await app.request(`/artifacts?projectId=${project.id}`, {
      headers: { authorization: `Bearer ${token}` },
    })
    assert.deepEqual(
      ((await listed.json()) as Artifact[]).map(item => item.id),
      [artifact.id],
    )

    const preview = await app.request(`/a/${artifact.key}`)
    assert.equal(preview.status, 200)
    assert.equal(await preview.text(), html)
    assert.match(preview.headers.get('content-disposition') ?? '', /^inline;/)
    assert.match(preview.headers.get('content-security-policy') ?? '', /sandbox allow-scripts/)
    assert.equal(preview.headers.get('cache-control'), 'private, no-store')

    const download = await app.request(`/a/${artifact.key}?download=1`)
    assert.match(download.headers.get('content-disposition') ?? '', /^attachment;/)

    assert.equal(
      (
        await app.request(`/artifacts/${artifact.id}`, {
          method: 'DELETE',
          headers: { authorization: `Bearer ${token}` },
        })
      ).status,
      204,
    )
    assert.equal((await app.request(`/a/${artifact.key}`)).status, 404)
  })

  test('worker cannot cross projects and announced oversize uploads are rejected', async () => {
    const { project, other, token } = await seed()
    const app = createApp(ctx.store, {
      artifactFiles: createArtifactFileStore(dataDir),
    })
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream' }
    assert.equal(
      (
        await app.request(`/artifacts?projectId=${other.id}&filename=x`, {
          method: 'POST',
          headers,
          body: 'x',
        })
      ).status,
      404,
    )
    assert.equal(
      (
        await app.request(`/artifacts?projectId=${project.id}&filename=huge.bin`, {
          method: 'POST',
          headers: { ...headers, 'content-length': String(MAX_ARTIFACT_BYTES + 1) },
          body: 'x',
        })
      ).status,
      413,
    )
  })

  test('SVG is downloaded instead of rendered inline', async () => {
    const { project, token } = await seed()
    const app = createApp(ctx.store, {
      artifactFiles: createArtifactFileStore(dataDir),
    })
    const published = await app.request(`/artifacts?projectId=${project.id}&filename=image.svg`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'image/svg+xml' },
      body: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    })
    const artifact = (await published.json()) as Artifact
    const response = await app.request(`/a/${artifact.key}`)
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-disposition') ?? '', /^attachment;/)
  })
})
