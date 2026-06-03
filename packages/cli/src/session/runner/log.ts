// Log helper for runDaemon: render a per-turn env overlay's keys (values masked)
// so the operator can see what was injected without leaking secrets.
export const maskedEnvKeys = (env: Record<string, string> | undefined): string =>
  env ? Object.keys(env).sort().join(', ') : '(none)'
