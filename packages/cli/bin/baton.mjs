#!/usr/bin/env node
// Dev shim: invoke tsx (resolved from this package's own node_modules) on
// src/index.ts. Caller's cwd is preserved so the .baton.json walk-up
// resolves against where the user is, not where this shim lives.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const entry = join(here, '..', 'src', 'index.ts')
const require = createRequire(import.meta.url)
const tsxBin = require.resolve('tsx/cli')
const stdio = process.connected ? ['inherit', 'inherit', 'inherit', 'ipc'] : 'inherit'
const child = spawn(process.execPath, [tsxBin, entry, ...process.argv.slice(2)], {
  stdio,
  cwd: process.cwd(),
})
if (process.connected) {
  process.on('message', message => child.send(message))
  child.on('message', message => process.send?.(message))
  process.on('disconnect', () => child.disconnect())
}
child.on('exit', code => process.exit(code ?? 0))
