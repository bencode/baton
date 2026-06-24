import { createConnection } from 'node:net'

// The fixed pool of ports ttyd terminals bind to — its size is the backpressure
// against runaway terminals (one per session; pool full ⇒ open is refused).
export const TTYD_PORTS = Array.from({ length: 10 }, (_, i) => 8901 + i)

// Browser-reachable base for a terminal URL. SAFE DEFAULT: loopback only
// (http://127.0.0.1) — ttyd serves an UNAUTHENTICATED interactive claude shell,
// so we never advertise/bind it on the network by default. Setting
// BATON_TERMINAL_BASE both advertises that host AND opts ttyd into binding all
// interfaces (see buildTtydArgs) — only behind a trusted network or the v2 proxy.
export const exposeNetwork = (env: NodeJS.ProcessEnv = process.env): boolean =>
  Boolean(env.BATON_TERMINAL_BASE)
export const terminalBase = (env: NodeJS.ProcessEnv = process.env): string =>
  env.BATON_TERMINAL_BASE ?? 'http://127.0.0.1'

// bash -c SCRIPT arg0 arg1… → $0=baton $1=worktree $2=agentSessionId $3=claudeBin.
// Resume the session's own JSONL if it exists, else start a fresh one at that id.
const TTYD_SCRIPT =
  'cd "$1" || exit 1\n' +
  'sf=$(find "$HOME/.claude/projects" -maxdepth 2 -name "$2.jsonl" -print -quit 2>/dev/null)\n' +
  'if [ -n "$sf" ]; then exec "$3" --resume "$2"; else exec "$3" --session-id "$2"; fi'

// Build the ttyd argv. `--once` accepts a single client and exits on disconnect
// (the iframe closing auto-frees the port). `-W` allows input. Binds loopback
// unless exposeNetwork. Pure, so the loopback-default + script are unit-testable.
export const buildTtydArgs = (input: {
  port: number
  exposeNetwork: boolean
  worktreePath: string
  agentSessionId: string
  claudeBin: string
}): string[] => [
  '-p',
  String(input.port),
  ...(input.exposeNetwork ? [] : ['-i', '127.0.0.1']),
  '-W',
  '--once',
  '-t',
  'fontSize=14',
  '--',
  'bash',
  '-c',
  TTYD_SCRIPT,
  'baton',
  input.worktreePath,
  input.agentSessionId,
  input.claudeBin,
]

// Poll a TCP port until it accepts (ttyd is listening) or we give up. ttyd
// cold-start (libwebsockets init) is ~sub-second on modern hardware. A bare TCP
// probe is not a ttyd WS client, so it doesn't consume the `--once` budget.
export const waitForPort = (port: number, timeoutMs = 3000): Promise<void> =>
  new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs
    const attempt = (): void => {
      const sock = createConnection({ port, host: '127.0.0.1' })
      sock.once('connect', () => {
        sock.destroy()
        resolve()
      })
      sock.once('error', () => {
        sock.destroy()
        if (Date.now() > deadline) reject(new Error(`port ${port} did not open`))
        else setTimeout(attempt, 100)
      })
    }
    attempt()
  })
