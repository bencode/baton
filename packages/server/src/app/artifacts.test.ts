import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
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
    return { workspace, project, other, token: registered.apiToken }
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
    assert.deepEqual(readdirSync(join(dataDir, String(project.id))), [])
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

  test('streamed uploads enforce the size limit without a content-length header', async () => {
    const { project, token } = await seed()
    const streamLimit = 2 * 1024 * 1024
    const app = createApp(ctx.store, {
      artifactFiles: createArtifactFileStore(dataDir, streamLimit),
    })
    const chunk = new Uint8Array(1024 * 1024)
    let remaining = streamLimit + 1
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (remaining === 0) return controller.close()
        const size = Math.min(remaining, chunk.byteLength)
        controller.enqueue(size === chunk.byteLength ? chunk : chunk.subarray(0, size))
        remaining -= size
      },
    })
    const request = new Request(
      `http://localhost/artifacts?projectId=${project.id}&filename=huge.bin`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream' },
        body,
        duplex: 'half',
      } as RequestInit & { duplex: 'half' },
    )

    const response = await app.fetch(request)

    assert.equal(response.status, 413)
    assert.deepEqual(readdirSync(join(dataDir, String(project.id))), [])
    assert.deepEqual(await ctx.store.artifacts.listByProject(project.id), [])
  })

  test('project and workspace deletion remove their artifact directories', async () => {
    const { workspace, project, other, token } = await seed()
    const registered = await ctx.store.workers.register({
      projectId: other.id,
      machineId: 'other-machine',
      name: 'other-worker',
      hostname: 'other-host',
    })
    if (registered.kind === 'name-collision') throw new Error('unexpected collision')
    const app = createApp(ctx.store, {
      artifactFiles: createArtifactFileStore(dataDir),
    })
    const publish = async (projectId: number, apiToken: string): Promise<Response> =>
      app.request(`/artifacts?projectId=${projectId}&filename=report.txt`, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiToken}`, 'content-type': 'text/plain' },
        body: 'report',
      })
    assert.equal((await publish(project.id, token)).status, 201)
    assert.equal((await publish(other.id, registered.apiToken)).status, 201)

    assert.equal(
      (
        await app.request(`/projects/${project.id}`, {
          method: 'DELETE',
          headers: { authorization: `Bearer ${token}` },
        })
      ).status,
      204,
    )
    assert.equal(existsSync(join(dataDir, String(project.id))), false)

    assert.equal(
      (
        await app.request(`/workspaces/${workspace.id}`, {
          method: 'DELETE',
          headers: { authorization: `Bearer ${registered.apiToken}` },
        })
      ).status,
      204,
    )
    assert.equal(existsSync(join(dataDir, String(other.id))), false)
  })

  test('cleanup failures are logged and remain best-effort', async () => {
    const { project, token } = await seed()
    const artifact = await ctx.store.artifacts.create({
      projectId: project.id,
      key: 'cleanup-key',
      storageId: 'cleanup-storage',
      filename: 'report.txt',
      contentType: 'text/plain',
      size: 1,
    })
    const invalidRoot = join(dataDir, 'not-a-directory')
    writeFileSync(invalidRoot, 'file')
    const files = createArtifactFileStore(invalidRoot)
    const app = createApp(ctx.store, { artifactFiles: files })
    const messages: string[] = []
    const originalError = console.error
    console.error = (...args: unknown[]) => {
      messages.push(args.map(String).join(' '))
    }
    try {
      const response = await app.request(`/artifacts/${artifact.id}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      })
      assert.equal(response.status, 204)
    } finally {
      console.error = originalError
    }

    assert.equal(await ctx.store.artifacts.get(artifact.id), null)
    assert.equal(messages.length, 1)
    assert.equal(
      messages[0]?.includes(join(invalidRoot, String(project.id), 'cleanup-storage')),
      true,
    )
  })
})
