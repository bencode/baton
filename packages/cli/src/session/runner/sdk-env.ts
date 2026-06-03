// Environment for the SDK's claude subprocess. When the SDK `env` option is
// omitted the subprocess inherits `process.env` wholesale (carrying whatever
// ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN / ANTHROPIC_API_KEY the worker was
// started with — the gateway auth path proven against increa-reader). We only
// build an explicit env when a per-turn overlay needs to win over the ambient
// one; then we still spread process.env first so auth keys survive.
export const buildSdkEnv = (
  overlay?: Record<string, string>,
): Record<string, string | undefined> | undefined =>
  overlay ? { ...process.env, ...overlay } : undefined

// Optional override for which claude binary the SDK drives. Unset → the SDK's
// bundled CLI. Named to match the old spawn path's BATON_CLAUDE_BIN so existing
// worker configs keep pointing at the same binary.
export const claudeExecutable = (): string | undefined => process.env.BATON_CLAUDE_BIN
