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
