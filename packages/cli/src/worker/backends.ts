import type { Task } from '@baton/shared'

// A backend is given the task to run and a `send(payload)` to ship events
// upstream. Returns the terminal status + a short result tag. baton itself
// doesn't interpret event payloads — they're opaque envelopes to the server.
export type BackendResult = { status: 'done' | 'failed'; result?: string }
export type Backend = (
  task: Task,
  send: (payload: unknown) => Promise<void>,
) => Promise<BackendResult>

export type BackendName = 'echo' | 'claude'

export const echoBackend: Backend = async (task, send) => {
  await send({ type: 'status', message: 'starting' })
  await send({ type: 'text', message: task.spec ?? task.title })
  await send({ type: 'result', subtype: 'success' })
  return { status: 'done', result: 'echo-done' }
}

// Dynamic import so the SDK is optional unless --backend claude is selected.
// Worker runs in cwd; permissionMode 'bypassPermissions' is intentional —
// M2 has no sandbox (M3 will add git-worktree isolation).
export const claudeBackend =
  (cwd: string): Backend =>
  async (task, send) => {
    type SDKQuery = (input: {
      prompt: string
      options?: { cwd?: string; permissionMode?: string }
    }) => AsyncIterable<unknown>
    const mod = (await import('@anthropic-ai/claude-agent-sdk')) as unknown as { query: SDKQuery }
    const stream = mod.query({
      prompt: task.spec ?? task.title,
      options: { cwd, permissionMode: 'bypassPermissions' },
    })
    let subtype = ''
    for await (const event of stream) {
      await send(event)
      const e = event as { type?: string; subtype?: string }
      if (e.type === 'result') {
        subtype = e.subtype ?? ''
        break
      }
    }
    if (subtype === 'success') return { status: 'done', result: 'success' }
    return { status: 'failed', result: subtype || 'no terminal' }
  }

export const resolveBackend = (name: BackendName, cwd: string): Backend => {
  if (name === 'echo') return echoBackend
  if (name === 'claude') return claudeBackend(cwd)
  throw new Error(`unknown backend ${name}`)
}
