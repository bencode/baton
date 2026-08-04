import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, test } from 'node:test'
import { syncBundledArtifactSkill } from './bundled-skills.ts'

describe('syncBundledArtifactSkill', () => {
  const roots: string[] = []
  afterEach(() => {
    roots.splice(0).forEach(root => {
      rmSync(root, { recursive: true, force: true })
    })
  })

  test('installs Claude and Codex copies without dirtying the worktree', () => {
    const repo = mkdtempSync(join(tmpdir(), 'baton-skill-'))
    roots.push(repo)
    assert.equal(spawnSync('git', ['init', repo], { stdio: 'pipe' }).status, 0)

    syncBundledArtifactSkill(repo, repo)

    const relativePaths = [
      '.claude/skills/baton-publish-artifact/SKILL.md',
      '.agents/skills/baton-publish-artifact/SKILL.md',
    ]
    relativePaths.forEach(path => {
      assert.equal(existsSync(join(repo, path)), true)
    })
    assert.equal(
      spawnSync('git', ['-C', repo, 'status', '--short'], { encoding: 'utf8' }).stdout,
      '',
    )
    const exclude = readFileSync(join(repo, '.git/info/exclude'), 'utf8')
    assert.match(exclude, /\.claude\/skills\/baton-publish-artifact\//)
    assert.match(exclude, /\.agents\/skills\/baton-publish-artifact\//)
  })

  test('preserves a repository-tracked skill with the same name', () => {
    const repo = mkdtempSync(join(tmpdir(), 'baton-skill-tracked-'))
    roots.push(repo)
    assert.equal(spawnSync('git', ['init', repo], { stdio: 'pipe' }).status, 0)
    const skillPath = join(repo, '.agents/skills/baton-publish-artifact/SKILL.md')
    mkdirSync(join(repo, '.agents/skills/baton-publish-artifact'), { recursive: true })
    writeFileSync(skillPath, 'repository version\n')
    assert.equal(
      spawnSync('git', ['-C', repo, 'add', '.agents/skills/baton-publish-artifact/SKILL.md'])
        .status,
      0,
    )

    syncBundledArtifactSkill(repo, repo)

    assert.equal(readFileSync(skillPath, 'utf8'), 'repository version\n')
  })
})
