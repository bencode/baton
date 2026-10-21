import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  branchFromPathSegment,
  branchPathSegment,
  imageMediaType,
  isBranchName,
  isSensitiveFilePath,
  normalizeFilePath,
  rawMediaType,
} from './file.ts'

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

test('isBranchName accepts Git branch names and rejects empty or control characters', () => {
  for (const name of ['main', 'feat/files-read-chain', 'release-0.8'])
    assert.equal(isBranchName(name), true, name)
  for (const name of ['', 'a\0b', 'a\nb', 'x'.repeat(256)]) assert.equal(isBranchName(name), false)
})

test('imageMediaType recognises image extensions case-insensitively', () => {
  assert.equal(imageMediaType('docs/arch.PNG'), 'image/png')
  assert.equal(imageMediaType('logo.svg'), 'image/svg+xml')
  assert.equal(imageMediaType('photo.jpeg'), 'image/jpeg')
  for (const path of ['notes.md', 'png', 'archive.png.txt', 'Makefile'])
    assert.equal(imageMediaType(path), null, path)
})

test('raw serves images plus the stylesheets and fonts a page links to, never scripts', () => {
  assert.equal(rawMediaType('docs/arch.png'), 'image/png')
  assert.equal(rawMediaType('site/report.CSS'), 'text/css')
  assert.equal(rawMediaType('fonts/inter.woff2'), 'font/woff2')
  assert.equal(imageMediaType('site/report.css'), null)
  for (const path of ['app.js', 'page.html', 'data.json'])
    assert.equal(rawMediaType(path), null, path)
})

test('a branch fits one URL path segment and comes back unchanged', () => {
  const cases: [branch: string, segment: string][] = [
    ['main', 'main'],
    ['feat/x', 'feat:x'],
    ['修复/预览 页', '%E4%BF%AE%E5%A4%8D:%E9%A2%84%E8%A7%88%20%E9%A1%B5'],
  ]
  for (const [branch, segment] of cases) {
    assert.equal(branchPathSegment(branch), segment)
    assert.equal(branchFromPathSegment(decodeURIComponent(segment)), branch)
  }
})
