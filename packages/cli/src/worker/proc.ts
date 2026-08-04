import type { ChildProcess } from 'node:child_process'

// Kill a detached child AND its descendants: `detached` makes it a process-group
// leader, so a negative-pid signal tears down the whole group (no orphaned
// claude / tsx). Used by the headless session children (the interactive pty
// terminals are torn down by node-pty's own kill, not this).
export const killProcessGroup = (proc: ChildProcess): void => {
  if (proc.pid === undefined) return
  killPidGroup(proc.pid)
}

export const killPidGroup = (pid: number, signal: NodeJS.Signals = 'SIGTERM'): void => {
  try {
    process.kill(-pid, signal)
  } catch {
    // already gone
  }
}
