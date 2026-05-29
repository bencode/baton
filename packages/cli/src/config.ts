import { loadProjectConfigOrNull, projectConfigPath } from './project-config.ts'

// Resolve the baton server base url. Priority:
//   --url flag  >  .baton.json in cwd  >  BATON_URL env  >  localhost default
export const resolveBaseUrl = (
  urlArg?: string,
  env: Record<string, string | undefined> = process.env,
): string => {
  if (urlArg) return urlArg
  const cfg = loadProjectConfigOrNull(projectConfigPath())
  if (cfg?.server) return cfg.server
  return env.BATON_URL ?? 'http://localhost:3280'
}
