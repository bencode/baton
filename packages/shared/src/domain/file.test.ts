import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isSensitiveFilePath, normalizeFilePath } from './file.ts'

test('normalizeFilePath accepts root-relative paths and rejects escapes', () => {
  assert.equal(normalizeFilePath('docs/计划 #1 100%.md'), 'docs/计划 #1 100%.md')
  assert.equal(normalizeFilePath('', true), '')
  for (const value of [
    '',
    '/etc/passwd',
    '../secret',
    'a/../b',
    'a/./b',
    'a//b',
    'a/',
    'a\\b',
    'a\0b',
    'C:/x',
  ])
    assert.equal(normalizeFilePath(value), null, JSON.stringify(value))
})

test('isSensitiveFilePath blocks credentials and Git internals but not samples', () => {
  for (const path of [
    '.env',
    'apps/web/.env.local',
    '.baton.json',
    'sub/.git/config',
    '.ssh/known_hosts',
    'id_rsa',
    'certs/server.PEM',
  ])
    assert.equal(isSensitiveFilePath(path), true, path)
  for (const path of ['.env.example', 'id_rsa.pub', 'docs/gitignore.md', 'environment.ts'])
    assert.equal(isSensitiveFilePath(path), false, path)
})
