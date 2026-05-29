// Helpers shared by runTurn/runDaemon: log formatting + claude argv builder +
// stderr ring buffer for post-mortem on a failed exit.
export const claudeBin = (): string => process.env.BATON_CLAUDE_BIN ?? 'claude'

// Claude requires --verbose alongside --print + --output-format=stream-json
// (otherwise it errors out before producing any events).
export const buildClaudeArgs = (
  claudeSessionId: string,
  text: string,
  resuming: boolean,
): string[] => [
  '--print',
  resuming ? '--resume' : '--session-id',
  claudeSessionId,
  '--output-format',
  'stream-json',
  '--verbose',
  '--dangerously-skip-permissions',
  text,
]

// Last ~2KB of claude stderr, so a non-zero exit lands a useful tail in
// turn_error / turn_complete payloads. UI can render the tail to the operator.
const STDERR_TAIL_BYTES = 2048

export type TailBuffer = { append: (chunk: string) => void; toString: () => string }
export const tailBuffer = (cap = STDERR_TAIL_BYTES): TailBuffer => {
  let buf = ''
  return {
    append(chunk) {
      buf = (buf + chunk).slice(-cap)
    },
    toString() {
      return buf
    },
  }
}

export const maskedEnvKeys = (env: Record<string, string> | undefined): string =>
  env ? Object.keys(env).sort().join(', ') : '(none)'

export const previewText = (text: string, max = 80): string =>
  text.length > max ? `${text.slice(0, max)}…` : text
