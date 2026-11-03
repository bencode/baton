import 'dotenv/config'
import { DatabaseSync } from 'node:sqlite'
import pg from 'pg'
import { loadConfig } from './config.ts'

// One-off cutover: copy a legacy SQLite baton.db into an empty, migrated PostgreSQL
// database. Run with the server stopped: `db:import-sqlite <sqlite-path>`, target =
// DATABASE_URL. Everything happens in ONE PG transaction, so a failure leaves the
// target empty and the import can simply be re-run. Table/column/FK metadata is read
// from the migrated PG catalog — the target schema is the authority.

type ColumnType = 'integer' | 'text' | 'boolean' | 'timestamp without time zone'
type TableSpec = {
  table: string
  columns: { name: string; type: ColumnType }[]
  serialId: string | null // the autoincrement id column, whose sequence must be reset
}

const BATCH = 500
const COLUMN_TYPES: readonly string[] = [
  'integer',
  'text',
  'boolean',
  'timestamp without time zone',
]

const isColumnType = (type: string): type is ColumnType => COLUMN_TYPES.includes(type)

const loadColumns = async (client: pg.Client): Promise<Map<string, TableSpec>> => {
  const { rows } = await client.query<{
    table_name: string
    column_name: string
    data_type: string
    column_default: string | null
  }>(
    `SELECT table_name, column_name, data_type, column_default FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name <> '_prisma_migrations'
     ORDER BY table_name, ordinal_position`,
  )
  const specs = new Map<string, TableSpec>()
  for (const row of rows) {
    if (!isColumnType(row.data_type))
      throw new Error(`${row.table_name}.${row.column_name}: unsupported type ${row.data_type}`)
    const spec = specs.get(row.table_name) ?? { table: row.table_name, columns: [], serialId: null }
    spec.columns.push({ name: row.column_name, type: row.data_type })
    if (row.column_default?.startsWith('nextval(')) spec.serialId = row.column_name
    specs.set(row.table_name, spec)
  }
  return specs
}

// Tables ordered so every FK target is inserted before the rows referencing it.
const loadSpecs = async (client: pg.Client): Promise<TableSpec[]> => {
  const specs = await loadColumns(client)
  const { rows: edges } = await client.query<{ child: string; parent: string }>(
    `SELECT ch.relname AS child, pa.relname AS parent FROM pg_constraint c
     JOIN pg_class ch ON ch.oid = c.conrelid JOIN pg_class pa ON pa.oid = c.confrelid
     JOIN pg_namespace n ON n.oid = c.connamespace
     WHERE c.contype = 'f' AND n.nspname = current_schema()`,
  )
  const self = edges.find(edge => edge.child === edge.parent)
  if (self) throw new Error(`self-referencing FK on ${self.child} is not supported`)
  const ordered: TableSpec[] = []
  const visit = (table: string, path: string[]): void => {
    const spec = specs.get(table)
    if (!spec) throw new Error(`FK references unknown table ${table}`)
    if (ordered.includes(spec)) return
    if (path.includes(table)) throw new Error(`FK cycle: ${[...path, table].join(' → ')}`)
    for (const edge of edges.filter(e => e.child === table)) visit(edge.parent, [...path, table])
    ordered.push(spec)
  }
  for (const table of specs.keys()) visit(table, [])
  return ordered
}

const toPg = (type: ColumnType, value: unknown): unknown => {
  if (value === null) return null
  if (type === 'timestamp without time zone') return new Date(String(value)).toISOString()
  if (type === 'boolean') return value === 1
  return value
}

const preflight = (db: DatabaseSync, specs: TableSpec[]): void => {
  const check = db.prepare('PRAGMA quick_check').all()
  if (check.length !== 1 || check[0]?.quick_check !== 'ok')
    throw new Error(`sqlite quick_check failed: ${JSON.stringify(check)}`)
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '_prisma_migrations'",
    )
    .all()
    .map(row => String(row.name))
    .sort()
  const expected = specs.map(spec => spec.table).sort()
  if (JSON.stringify(tables) !== JSON.stringify(expected))
    throw new Error(`table mismatch: sqlite=${tables.join(',')} schema=${expected.join(',')}`)
}

const insertBatch = async (client: pg.Client, spec: TableSpec, rows: Record<string, unknown>[]) => {
  const cols = spec.columns.map(col => `"${col.name}"`).join(', ')
  const width = spec.columns.length
  const values = rows
    .map((_, r) => `(${spec.columns.map((_, c) => `$${r * width + c + 1}`).join(', ')})`)
    .join(', ')
  const params = rows.flatMap(row =>
    spec.columns.map(col => {
      if (!(col.name in row)) throw new Error(`${spec.table}: sqlite row lacks column ${col.name}`)
      return toPg(col.type, row[col.name])
    }),
  )
  try {
    await client.query(`INSERT INTO "${spec.table}" (${cols}) VALUES ${values}`, params)
  } catch (e) {
    const ids = spec.serialId
      ? ` ids ${rows[0]?.[spec.serialId]}..${rows.at(-1)?.[spec.serialId]}`
      : ''
    throw new Error(`${spec.table}${ids}: ${e instanceof Error ? e.message : String(e)}`, {
      cause: e,
    })
  }
}

const importTable = async (db: DatabaseSync, client: pg.Client, spec: TableSpec) => {
  const started = Date.now()
  let rows = 0
  let batch: Record<string, unknown>[] = []
  for (const row of db.prepare(`SELECT * FROM "${spec.table}"`).iterate()) {
    batch.push(row)
    if (batch.length < BATCH) continue
    await insertBatch(client, spec, batch)
    rows += batch.length
    batch = []
    if (rows % 50_000 === 0) console.log(`[import] ${spec.table}: ${rows} rows…`)
  }
  if (batch.length > 0) await insertBatch(client, spec, batch)
  rows += batch.length
  console.log(`[import] ${spec.table}: ${rows} rows in ${Date.now() - started}ms`)
  return rows
}

const stats = (spec: TableSpec) =>
  `SELECT count(*) AS n${spec.serialId ? `, max("${spec.serialId}") AS m` : ''} FROM "${spec.table}"`

const verify = async (db: DatabaseSync, client: pg.Client, specs: TableSpec[]) => {
  for (const spec of specs) {
    const lite = db.prepare(stats(spec)).get()
    const { rows } = await client.query(stats(spec))
    const pgRow = rows[0]
    if (Number(lite?.n) !== Number(pgRow?.n) || (lite?.m ?? null) !== (pgRow?.m ?? null))
      throw new Error(
        `${spec.table}: sqlite n=${lite?.n} m=${lite?.m} ≠ pg n=${pgRow?.n} m=${pgRow?.m}`,
      )
  }
}

const resetSequence = (client: pg.Client, spec: TableSpec, id: string) =>
  client.query(
    `SELECT setval(pg_get_serial_sequence('"${spec.table}"', '${id}'), GREATEST(max("${id}"), 1), max("${id}") IS NOT NULL) FROM "${spec.table}"`,
  )

const run = async (sqlitePath: string, pgUrl: string) => {
  const db = new DatabaseSync(sqlitePath, { readOnly: true })
  const client = new pg.Client({ connectionString: pgUrl })
  await client.connect()
  try {
    await client.query('BEGIN')
    const specs = await loadSpecs(client)
    preflight(db, specs)
    for (const spec of specs) {
      const { rows } = await client.query(`SELECT count(*) AS n FROM "${spec.table}"`)
      if (Number(rows[0]?.n) !== 0) throw new Error(`target ${spec.table} is not empty`)
    }
    for (const spec of specs) await importTable(db, client, spec)
    for (const spec of specs) if (spec.serialId) await resetSequence(client, spec, spec.serialId)
    await verify(db, client, specs)
    await client.query('COMMIT')
  } catch (e) {
    console.error('[import] failed, rolling back:', e)
    await client.query('ROLLBACK')
    throw e
  } finally {
    await client.end()
    db.close()
  }
}

const args = process.argv.slice(2)
if (args.length !== 1 || !args[0]) throw new Error('usage: db:import-sqlite <sqlite-path>')
const started = Date.now()
await run(args[0], loadConfig().databaseUrl)
console.log(`[import] done in ${Date.now() - started}ms`)
