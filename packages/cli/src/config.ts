// Resolve the baton server base url: --url flag > BATON_URL env > localhost default.
export const resolveBaseUrl = (
  urlArg?: string,
  env: Record<string, string | undefined> = process.env,
): string => urlArg ?? env.BATON_URL ?? 'http://localhost:3280'
