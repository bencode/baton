#!/usr/bin/env node
// Load TypeScript directly in the child so IPC disconnect reaches the runner
// or service wrapper without an intermediate tsx CLI process.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const entry = join(here, '..', 'src', 'index.ts')
const require = createRequire(import.meta.url)
const loader = pathToFileURL(require.resolve('tsx')).href
const stdio = process.connected ? ['inherit', 'inherit', 'inherit', 'ipc'] : 'inherit'
const child = spawn(process.execPath, ['--import', loader, entry, ...process.argv.slice(2)], {
  stdio,
  cwd: process.cwd(),
})
if (process.connected) {
  process.on('message', message => child.send(message))
  child.on('message', message => process.send?.(message))
  process.on('disconnect', () => child.disconnect())
}
child.on('exit', code => process.exit(code ?? 0))
