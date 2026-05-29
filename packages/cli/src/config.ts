import { findProjectConfig } from './project-config.ts'

// Resolve the baton server base url. Priority:
//   --url flag  >  .baton.json (cwd upwards)  >  BATON_URL env  >  localhost default
export const resolveBaseUrl = (
  urlArg?: string,
  env: Record<string, string | undefined> = process.env,
): string => {
  if (urlArg) return urlArg
  const found = findProjectConfig()
  if (found?.config.server) return found.config.server
  return env.BATON_URL ?? 'http://localhost:3280'
}
