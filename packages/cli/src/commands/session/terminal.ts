import { defineCommand } from 'citty'
import { fmtSession, renderOne } from '../../output.ts'
import { clientFor, common, resolveProjectId } from '../../util.ts'
import { resolveSession } from './shared.ts'

const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms))

// Open (or --close) an interactive terminal (`claude --resume` in a pty) for a
// session — hands-on / human-in-the-loop, alongside the headless relay. The worker
// spawns the pty + dials its WS back to the server asynchronously, so after open we
// poll the session view until terminalOpen flips true. There's no direct URL: the
// terminal is viewed in the web UI (same-origin xterm over the server bridge).
// Opening an active session 409s (stop it first).
export const sessionTerminalCommand = defineCommand({
  meta: { name: 'terminal', description: 'open an interactive terminal for a session' },
  args: {
    session: { type: 'positional', required: true, description: 'session int id or name' },
    project: { type: 'string', description: 'project id (overrides .baton.json)' },
    close: { type: 'boolean', description: 'close the terminal instead of opening one' },
    ...common,
  },
  run: async ({ args }) => {
    const c = clientFor(args)
    const handle = await resolveSession(c, resolveProjectId(args), args.session)
    if (args.close) {
      const s = await c.sessions.closeTerminal(handle.id)
      console.log(renderOne(s, fmtSession, Boolean(args.json)))
      return
    }
    let view: Awaited<ReturnType<typeof c.sessions.openTerminal>>
    try {
      view = await c.sessions.openTerminal(handle.id)
    } catch (e) {
      // Surfaces the server's message (e.g. 409 "session active — stop it…").
      console.log(e instanceof Error ? e.message : String(e))
      return
    }
    for (let i = 0; i < 10 && !view.terminalOpen; i++) {
      await sleep(500)
      view = await c.sessions.get(handle.id)
    }
    if (args.json) console.log(renderOne(view, fmtSession, true))
    else if (view.terminalOpen)
      console.log(`terminal open — view session #${handle.id} in the web UI`)
    else console.log('terminal did not start (worker offline, or pty unavailable)')
  },
})
