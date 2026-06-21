import type { createApp } from '../app.ts'

// HTTP test helpers shared by app/*.test.ts files. Not a test file itself.
export type WithId = { id: number }
export type WithCode = WithId & { code: string }

export const postJson = (
  app: ReturnType<typeof createApp>,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  app.request(path, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
  })

// Open a channel and return its id, token, and a ready bearer-auth header — most
// channel tests start here. Channels now belong to a workspace, so this seeds a
// fresh one (unique name via a counter) and creates the room under it.
export type ChannelHandle = { channelId: string; token: string; auth: Record<string, string> }
let chanWsSeq = 0
export const createChannel = async (
  app: ReturnType<typeof createApp>,
  body: Record<string, unknown> = {},
): Promise<ChannelHandle> => {
  const w = (await (
    await postJson(app, '/workspaces', { name: `chan-ws-${++chanWsSeq}` })
  ).json()) as WithId
  const ch = (await (await postJson(app, `/workspaces/${w.id}/channels`, body)).json()) as {
    channelId: string
    token: string
  }
  return { ...ch, auth: { authorization: `Bearer ${ch.token}` } }
}

// Drain an SSE reader until `n` `data:` frames are seen or `ms` elapses; returns
// the accumulated text. Used by streaming tests over a real server.
export const readUntil = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  n: number,
  ms: number,
): Promise<string> => {
  const dec = new TextDecoder()
  let buf = ''
  const start = Date.now()
  while (Date.now() - start < ms) {
    const r = await Promise.race([
      reader.read(),
      new Promise<{ done: true; value?: undefined }>(res =>
        setTimeout(() => res({ done: true }), ms - (Date.now() - start)),
      ),
    ])
    if (!r || r.done || !r.value) break
    buf += dec.decode(r.value)
    if ((buf.match(/^data:/gm) ?? []).length >= n) break
  }
  return buf
}

// Seed workspace → project → worker (registered + alive). Returns the ids plus
// the worker apiToken so tests can act as the worker (create/materialize/events).
export const seedWorker = async (
  app: ReturnType<typeof createApp>,
): Promise<{ projectId: number; workerId: number; workerToken: string }> => {
  const w = (await (await postJson(app, '/workspaces', { name: 'w' })).json()) as WithId
  const p = (await (
    await postJson(app, '/projects', { workspaceId: w.id, name: 'p' })
  ).json()) as WithId
  const reg = (await (
    await postJson(app, '/workers', {
      projectId: p.id,
      machineId: 'mid-test',
      name: 'test-worker',
      hostname: 'h-test',
    })
  ).json()) as { worker: WithId; apiToken: string }
  return { projectId: p.id, workerId: reg.worker.id, workerToken: reg.apiToken }
}

// Create a session (metadata only — agentSessionId/worktreePath stay null until
// a worker materializes via PATCH).
export const seedSession = async (app: ReturnType<typeof createApp>) => {
  const { projectId, workerId, workerToken } = await seedWorker(app)
  const s = (await (
    await postJson(app, '/sessions', { projectId, workerId, name: 'dogfood' })
  ).json()) as WithId & {
    alive: boolean
    attached: boolean
    busy: boolean
    planMode: boolean
  }
  return { projectId, workerId, workerToken, session: s }
}
