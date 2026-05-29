import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

// `~/.local/share/baton/machine-id` — XDG_DATA_HOME layer (state, not config).
// Picked over `~/.config/baton/` because the user can `rm -rf ~/.config/baton`
// to reset tokens and shouldn't lose machine identity in the process.
export const machineIdPath = (env: NodeJS.ProcessEnv = process.env): string =>
  join(env.XDG_DATA_HOME ?? join(env.HOME ?? homedir(), '.local/share'), 'baton', 'machine-id')

// Read the local machine-id, lazily generating one on first call. baton-owned
// (not /etc/machine-id / IOPlatformUUID) so cross-platform + VM-clone safe and
// doesn't require root.
export const readOrCreateMachineId = (path: string = machineIdPath()): string => {
  if (existsSync(path)) {
    const s = readFileSync(path, 'utf8').trim()
    if (s) return s
  }
  const id = randomUUID()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${id}\n`, 'utf8')
  return id
}
