import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { piModelsJson } from './worker-template.ts'

test('pi models.json adds glm-5.4 to the built-in zai-coding-cn provider', async () => {
  const json = piModelsJson('zai-coding-cn')
  assert.ok(json)
  const dir = await mkdtemp(join(tmpdir(), 'baton-pi-models-'))
  const modelsPath = join(dir, 'models.json')
  await writeFile(modelsPath, json)
  const pi = await import('@earendil-works/pi-coding-agent')
  const runtime = await pi.ModelRuntime.create({ modelsPath, authPath: join(dir, 'auth.json') })
  const added = runtime.getModel('zai-coding-cn', 'glm-5.4')
  const builtIn = runtime.getModel('zai-coding-cn', 'glm-5.3')
  assert.ok(added && builtIn)
  // Endpoint and wire format come from the provider, so it talks to the same plan.
  assert.equal(added.api, builtIn.api)
  assert.equal(added.baseUrl, builtIn.baseUrl)
  assert.equal(added.contextWindow, 1_000_000)
  assert.equal(piModelsJson('qwen-token-plan-cn'), null)
})
