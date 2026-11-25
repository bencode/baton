import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { type WorkerCreation, workerTemplateAgentKinds } from '@baton/shared'
import type { ProvisionerConfig, WorkerTemplateConfig } from './config.ts'

// The profile this creation runs with, null for mini-local. Called before anything
// is created, so a template this host lacks leaves no directory or Worker behind.
export const requireWorkerTemplate = (
  config: ProvisionerConfig,
  creation: WorkerCreation,
): WorkerTemplateConfig | null => {
  if (!workerTemplateAgentKinds(creation.templateId).includes(creation.agentKind))
    throw new Error('agentKind is not supported by this template')
  if (creation.templateId === 'mini-local') return null
  const profile = config.templates[creation.templateId]
  if (!profile) throw new Error(`template ${creation.templateId} is not configured on this host`)
  return profile
}

// Models a coding plan already serves but pi's built-in catalog (pi-ai 1.6.0) does
// not list yet. pi reads <agent-dir>/models.json, where a provider's `models` entry
// adds to its built-in list (or replaces the same id); api, baseUrl and the API key
// stay the provider's. Drop an entry once pi ships the model itself.
const PI_EXTRA_MODELS: Record<string, Record<string, unknown>[]> = {
  'zai-coding-cn': [
    {
      id: 'glm-5.4',
      name: 'GLM-5.4',
      reasoning: true,
      input: ['text'],
      contextWindow: 1_000_000,
      maxTokens: 131_072,
      cost: { input: 1.4, output: 4.4, cacheRead: 0.26, cacheWrite: 0 },
      // Same as pi's built-in glm-5.3.
      thinkingLevelMap: {
        off: null,
        minimal: null,
        low: 'low',
        medium: null,
        high: 'high',
        xhigh: null,
        max: 'max',
      },
      compat: {
        supportsStore: false,
        supportsReasoningEffort: true,
        maxTokensField: 'max_tokens',
        thinkingFormat: 'zai',
        supportsStrictMode: true,
        zaiToolStream: true,
      },
    },
  ],
}

export const piModelsJson = (provider: string): string | null => {
  const models = PI_EXTRA_MODELS[provider]
  return models ? JSON.stringify({ providers: { [provider]: { models } } }) : null
}

export const workerTemplateEnvironment = async (
  config: ProvisionerConfig,
  creation: WorkerCreation,
  state: string,
): Promise<Record<string, string>> => {
  const profile = requireWorkerTemplate(config, creation)
  if (!profile) return config.workerEnv
  if (creation.agentKind !== 'pi') return profile.workerEnv
  if (!profile.pi) throw new Error('Pi provider and model are not configured')
  const agentDir = join(state, 'pi')
  await mkdir(agentDir, { mode: 0o700 })
  await writeFile(
    join(agentDir, 'settings.json'),
    JSON.stringify({
      defaultProvider: profile.pi.provider,
      defaultModel: profile.pi.model,
    }),
    { flag: 'wx', mode: 0o600 },
  )
  const models = piModelsJson(profile.pi.provider)
  if (models) await writeFile(join(agentDir, 'models.json'), models, { flag: 'wx', mode: 0o600 })
  return { ...profile.workerEnv, PI_CODING_AGENT_DIR: agentDir }
}
