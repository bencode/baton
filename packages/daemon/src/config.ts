export type Config = { databaseUrl: string; port: number }

// .env is loaded by dotenv (see index.ts); here we only read and validate.
export const loadConfig = (env: Record<string, string | undefined> = process.env): Config => {
  const databaseUrl = env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is required')
  return { databaseUrl, port: Number(env.PORT ?? 3030) }
}
