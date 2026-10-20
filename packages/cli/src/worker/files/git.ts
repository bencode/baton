import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)
const GIT_TIMEOUT_MS = 3_000

// Read-only git: literal pathspecs, no optional locks, never prompts.
export const runGit = async (
  cwd: string,
  args: string[],
  maxBuffer = 4 * 1024 * 1024,
): Promise<Buffer> => {
  const { stdout } = await run('git', ['--literal-pathspecs', '-C', cwd, ...args], {
    encoding: 'buffer',
    timeout: GIT_TIMEOUT_MS,
    maxBuffer,
    env: { ...process.env, LC_ALL: 'C', GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
  })
  return stdout
}
