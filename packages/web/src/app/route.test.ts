import { expect, test } from 'vitest'
import {
  activeProjectId,
  emptyTabsPath,
  isItemRoute,
  itemPath,
  parseRoute,
  projectPath,
  sessionPath,
  workspacePath,
} from './route'

test('parseRoute classifies each path shape', () => {
  expect(parseRoute('/')).toEqual({ kind: 'home' })
  expect(parseRoute('/ws/1')).toEqual({ kind: 'workspace', workspaceId: 1 })
  expect(parseRoute('/proj/1')).toEqual({ kind: 'project', projectId: 1 })
  expect(parseRoute('/proj/1/R-1')).toEqual({
    kind: 'item',
    projectId: 1,
    code: 'R-1',
    itemKind: 'requirement',
  })
  expect(parseRoute('/proj/1/T-5')).toEqual({
    kind: 'item',
    projectId: 1,
    code: 'T-5',
    itemKind: 'task',
  })
})

test('parseRoute treats invalid ids / unknown code prefix as home/project', () => {
  expect(parseRoute('/proj/abc')).toEqual({ kind: 'home' })
  // unknown code prefix falls back to the project route
  expect(parseRoute('/proj/1/X-9')).toEqual({ kind: 'project', projectId: 1 })
})

test('parseRoute: sessions go through /proj/<p>/session/<sid> (int id), not S-N', () => {
  expect(parseRoute('/proj/1/session/42')).toEqual({
    kind: 'session',
    projectId: 1,
    sessionId: 42,
  })
  expect(sessionPath(1, 42)).toBe('/proj/1/session/42')
  // S- prefix is no longer recognised — falls back to project.
  expect(parseRoute('/proj/1/S-2')).toEqual({ kind: 'project', projectId: 1 })
  // A-3 unchanged — assignments still gone from the URL surface.
  expect(parseRoute('/proj/1/A-3')).toEqual({ kind: 'project', projectId: 1 })
})

test('path builders round-trip through parseRoute', () => {
  expect(parseRoute(workspacePath(7))).toEqual({ kind: 'workspace', workspaceId: 7 })
  expect(parseRoute(projectPath(3))).toEqual({ kind: 'project', projectId: 3 })
  expect(parseRoute(itemPath(3, 'T-12'))).toMatchObject({
    kind: 'item',
    projectId: 3,
    code: 'T-12',
    itemKind: 'task',
  })
  expect(itemPath(1, 'T-5')).toBe('/proj/1/T-5')
})

test('isItemRoute is true for R-/T- and session paths (both open as tabs)', () => {
  expect(isItemRoute('/proj/1/T-1')).toBe(true)
  expect(isItemRoute('/proj/1/R-1')).toBe(true)
  expect(isItemRoute('/proj/1/session/42')).toBe(true)
  expect(isItemRoute('/proj/1')).toBe(false)
  expect(isItemRoute('/')).toBe(false)
})

test('activeProjectId extracts the project for project-scoped paths', () => {
  expect(activeProjectId('/proj/2/R-1')).toBe(2)
  expect(activeProjectId('/proj/2')).toBe(2)
  expect(activeProjectId('/ws/1')).toBeNull()
  expect(activeProjectId('/')).toBeNull()
})

test('emptyTabsPath keeps the current project context, else home', () => {
  expect(emptyTabsPath('/proj/2/R-1')).toBe('/proj/2')
  expect(emptyTabsPath('/proj/2/session/3')).toBe('/proj/2')
  expect(emptyTabsPath('/proj/2')).toBe('/proj/2')
  expect(emptyTabsPath('/ws/1')).toBe('/')
  expect(emptyTabsPath('/')).toBe('/')
})
