// Ensure node-pty's native addon actually loads after install. Its prebuilt
// binaries don't cover every Node version (24/26 ship none, or a partial one that
// installs without a working spawn-helper), so the bundle would crash the first
// time a worker opens a terminal. If it won't load, rebuild it from source (needs
// python3 + a C++ toolchain). Non-fatal: a worker that can't build it simply has
// interactive terminals disabled, while the headless relay keeps working.
import { execSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
try {
  require('node-pty')
} catch {
  try {
    execSync('npm rebuild node-pty --build-from-source', { stdio: 'inherit' })
  } catch {
    console.error(
      '[baton-cli] node-pty native build failed — interactive terminals disabled (install python3 + a C++ toolchain to enable them)',
    )
  }
}
