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
  return { ...profile.workerEnv, PI_CODING_AGENT_DIR: agentDir }
}
