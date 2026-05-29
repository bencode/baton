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

// Seed workspace → project → worker (registered + alive). Returns the ids so
// tests can register sessions against this worker.
export const seedWorker = async (
  app: ReturnType<typeof createApp>,
): Promise<{ projectId: number; workerId: number }> => {
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
  ).json()) as { worker: WithId }
  return { projectId: p.id, workerId: reg.worker.id }
}

export const seedSession = async (app: ReturnType<typeof createApp>) => {
  const { projectId, workerId } = await seedWorker(app)
  const s = (await (
    await postJson(app, '/sessions', {
      projectId,
      workerId,
      mode: 'worker',
      name: 'dogfood',
      agentKind: 'claude-code',
      agentSessionId: 'aaaa-bbbb-cccc-dddd',
      worktreePath: '/tmp/wt',
    })
  ).json()) as WithId & { apiToken: string; alive: boolean; busy: boolean }
  return { projectId, workerId, session: s }
}
