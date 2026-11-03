import 'dotenv/config'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PrismaClient } from '@prisma/client'
import { customAlphabet } from 'nanoid'
import pg from 'pg'
import { createPrisma } from '../db/client.ts'
import { createPrismaStore } from './prisma-store.ts'
import type { Store } from './types.ts'

// Read the generated migration SQL (consume the prisma migrate output; never hand-write it).
const loadSchemaSql = (): string => {
  const dir = fileURLToPath(new URL('../../prisma/migrations', import.meta.url))
  return readdirSync(dir)
    .map(name => join(dir, name, 'migration.sql'))
    .filter(existsSync)
    .map(f => readFileSync(f, 'utf8'))
    .join('\n')
}

// A PG server URL whose role may CREATE/DROP DATABASE; each test gets its own database there.
const adminUrl = (): string => {
  const url = process.env.BATON_TEST_DATABASE_URL
  if (!url)
    throw new Error(
      'BATON_TEST_DATABASE_URL is required, e.g. postgresql://baton:baton@localhost:5432/postgres',
    )
  return url
}

const databaseUrl = (admin: string, name: string): string => {
  const url = new URL(admin)
  url.pathname = `/${name}`
  return url.toString()
}

const withClient = async <T>(url: string, run: (client: pg.Client) => Promise<T>): Promise<T> => {
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    return await run(client)
  } finally {
    await client.end()
  }
}

const dbSuffix = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 12)

export type TestStore = { store: Store; prisma: PrismaClient; cleanup: () => Promise<void> }

// Each test gets a fresh PG database: create db → apply schema → build Store; cleanup drops it.
export const freshStore = async (): Promise<TestStore> => {
  const admin = adminUrl()
  const name = `baton_test_${dbSuffix()}`
  const url = databaseUrl(admin, name)
  await withClient(admin, client => client.query(`CREATE DATABASE "${name}"`))
  await withClient(url, client => client.query(loadSchemaSql()))
  const prisma = createPrisma(url)
  const store = createPrismaStore(prisma)
  return {
    store,
    prisma,
    cleanup: async () => {
      await store.close()
      await withClient(admin, client => client.query(`DROP DATABASE "${name}" WITH (FORCE)`))
    },
  }
}
