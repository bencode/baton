import { defineCommand } from 'citty'
import { fmtSession, renderOne } from '../../output.ts'
import { clientFor, common, resolveProjectId } from '../../util.ts'
import { resolveSession } from './shared.ts'

const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms))

// Open (or --close) an interactive ttyd terminal serving `claude --resume` for a
// session — hands-on / human-in-the-loop, alongside the headless relay. The
// worker spawns ttyd asynchronously, so after open we poll the session view until
// its terminalUrl appears, then print it. Opening an active session 409s (stop it
// first). The printed URL is reachable only if the worker host is (v1 is direct,
// no reverse proxy — see BATON_TERMINAL_BASE on the worker).
export const sessionTerminalCommand = defineCommand({
  meta: { name: 'terminal', description: 'open an interactive terminal (ttyd) for a session' },
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
    for (let i = 0; i < 10 && !view.terminalUrl; i++) {
      await sleep(500)
      view = await c.sessions.get(handle.id)
    }
    if (args.json) console.log(renderOne(view, fmtSession, true))
    else if (view.terminalUrl) console.log(view.terminalUrl)
    else console.log('terminal did not start (worker offline, no free port, or ttyd missing)')
  },
})
