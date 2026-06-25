import { build } from 'esbuild'

// Bundle the CLI to a single ESM file. Two deps stay EXTERNAL so npm installs +
// builds them next to the bundle: node-pty (a native addon) and the Claude Agent
// SDK (resolves a sibling binary via import.meta.url). The createRequire banner
// gives the ESM output a real `require`, so bundled CommonJS deps (ws) that call
// require() on Node builtins work instead of tripping esbuild's ESM shim, which
// throws `Dynamic require of "events" is not supported`.
await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'bundle',
  external: ['@anthropic-ai/claude-agent-sdk', 'node-pty'],
  banner: {
    js: "#!/usr/bin/env node\nimport { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);",
  },
  outfile: 'dist/baton.mjs',
})
