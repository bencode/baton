// Ensure node-pty can actually spawn a pty after install. Its prebuilt binaries
// are unreliable on newer Node (24/26 ship a partial one whose pty.node loads but
// whose spawn-helper fails with `posix_spawnp failed`), so a plain require() isn't
// a real check — spawn a throwaway pty. If that fails, rebuild from source (needs
// python3 + a C++ toolchain). Non-fatal: a host that can't build it just loses
// interactive terminals, while the headless relay keeps working.
import { execSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const works = () => {
  try {
    const pty = require('node-pty')
    pty.spawn(process.platform === 'win32' ? 'cmd.exe' : '/bin/sh', [], { cols: 80, rows: 24 }).kill()
    return true
  } catch {
    return false
  }
}

if (!works()) {
  try {
    execSync('npm rebuild node-pty --build-from-source', { stdio: 'inherit' })
  } catch {
    console.error(
      '[baton-cli] node-pty native build failed — interactive terminals disabled (install python3 + a C++ toolchain to enable them)',
    )
  }
}
