import { expect, test } from 'vitest'
import { classifyLink, resolveRelativePath } from './relative-link'

test('resolveRelativePath follows the document directory and stays in the repository', () => {
  const doc = 'docs/plans/06-handoff.md'
  expect(resolveRelativePath(doc, './07-next.md')).toBe('docs/plans/07-next.md')
  expect(resolveRelativePath(doc, '../README.md#usage')).toBe('docs/README.md')
  expect(resolveRelativePath(doc, '/packages/web/src/app.tsx?x=1')).toBe('packages/web/src/app.tsx')
  expect(resolveRelativePath(doc, '%E8%AE%A1%E5%88%92%20%231.md')).toBe('docs/plans/计划 #1.md')
  expect(resolveRelativePath('README.md', 'docs')).toBe('docs')
  expect(resolveRelativePath('docs/a.md', '..')).toBeNull()
  for (const href of [
    '../../../etc/passwd',
    'https://x.dev',
    '//cdn.dev/a',
    'mailto:a@b',
    '%E0%A4%A',
    '',
  ])
    expect(resolveRelativePath(doc, href), href).toBeNull()
})

test('classifyLink separates anchors, web links, repository files, and everything else', () => {
  const doc = 'docs/a.md'
  expect(classifyLink(doc, '#usage')).toEqual({ kind: 'anchor' })
  expect(classifyLink(doc, 'HTTPS://example.com')).toEqual({ kind: 'external' })
  expect(classifyLink(doc, 'b.md')).toEqual({ kind: 'file', path: 'docs/b.md' })
  expect(classifyLink(doc, 'javascript:alert(1)')).toEqual({ kind: 'inert' })
  expect(classifyLink(doc, '../../x.md')).toEqual({ kind: 'inert' })
})
