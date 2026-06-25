import { build } from 'esbuild'

// Bundle the bridge to a single ESM file. The Feishu SDK stays EXTERNAL (npm
// installs it next to the bundle) — it's a heavy CommonJS dep; bundling it bloats
// the output and risks dynamic-require breakage. The createRequire banner gives
// the ESM output a real `require` so any bundled CommonJS that require()s a Node
// builtin works (the same fix baton-cli needed). @baton/shared is bundled in (it
// isn't published on its own).
await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'bundle',
  external: ['@larksuiteoapi/node-sdk'],
  banner: {
    js: "#!/usr/bin/env node\nimport { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);",
  },
  outfile: 'dist/index.mjs',
})
