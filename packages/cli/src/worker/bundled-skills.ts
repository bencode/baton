import { spawnSync } from 'node:child_process'
import { cpSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureExcluded } from '../session/worktree.ts'

const SKILL_NAME = 'baton-publish-artifact'
const TARGETS = [`.claude/skills/${SKILL_NAME}`, `.agents/skills/${SKILL_NAME}`] as const

const bundledSkillPath = (): string => {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(here, '..', 'skills', SKILL_NAME),
    join(here, '..', '..', 'skills', SKILL_NAME),
  ]
  const found = candidates.find(existsSync)
  if (!found) throw new Error(`bundled skill missing: ${SKILL_NAME}`)
  return found
}

const isTracked = (worktreePath: string, relativePath: string): boolean => {
  const result = spawnSync('git', ['-C', worktreePath, 'ls-files', '--', relativePath], {
    encoding: 'utf8',
    stdio: 'pipe',
  })
  return result.status === 0 && result.stdout.trim().length > 0
}

export const syncBundledArtifactSkill = (repo: string, worktreePath: string): void => {
  const source = bundledSkillPath()
  TARGETS.filter(target => !isTracked(worktreePath, target)).forEach(target => {
    ensureExcluded(repo, `${target}/`)
    cpSync(source, join(worktreePath, target), { recursive: true, force: true })
  })
}
