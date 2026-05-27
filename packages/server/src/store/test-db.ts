import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@libsql/client'
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

export type TestStore = { store: Store; cleanup: () => Promise<void> }

// Each test gets a fresh temp SQLite file: create db → apply schema → build Store.
export const freshStore = async (): Promise<TestStore> => {
  const dir = mkdtempSync(join(tmpdir(), 'baton-test-'))
  const url = `file:${join(dir, 'test.db')}`
  const setup = createClient({ url })
  await setup.executeMultiple(loadSchemaSql())
  setup.close()
  const store = createPrismaStore(createPrisma(url))
  return {
    store,
    cleanup: async () => {
      await store.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}
