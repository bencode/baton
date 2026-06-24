import type { ChildProcess } from 'node:child_process'

// Kill a detached child AND its descendants: `detached` makes it a process-group
// leader, so a negative-pid signal tears down the whole group (no orphaned
// claude / tsx / ttyd). Shared by the session children and the ttyd terminals.
export const killProcessGroup = (proc: ChildProcess): void => {
  if (proc.pid === undefined) return
  try {
    process.kill(-proc.pid, 'SIGTERM')
  } catch {
    // already gone
  }
}
