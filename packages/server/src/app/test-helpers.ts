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

export const seedSession = async (app: ReturnType<typeof createApp>) => {
  const w = (await (await postJson(app, '/workspaces', { name: 'w' })).json()) as WithId
  const p = (await (
    await postJson(app, '/projects', { workspaceId: w.id, name: 'p' })
  ).json()) as WithId
  const s = (await (
    await postJson(app, '/sessions', {
      projectId: p.id,
      mode: 'worker',
      name: 'dogfood',
      claudeSessionId: 'aaaa-bbbb-cccc-dddd',
      worktreePath: '/tmp/wt',
      machineId: 'mid-test',
      hostname: 'h-test',
      workerName: 'ben-laptop',
    })
  ).json()) as WithId & { apiToken: string; alive: boolean; busy: boolean }
  return { projectId: p.id, session: s }
}
