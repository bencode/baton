import { expect, test } from 'vitest'
import {
  activeProjectId,
  isItemRoute,
  parseRoute,
  projectPath,
  requirementPath,
  taskPath,
  workspacePath,
} from './route'

test('parseRoute classifies each path shape', () => {
  expect(parseRoute('/')).toEqual({ kind: 'home' })
  expect(parseRoute('/ws/w1')).toEqual({ kind: 'workspace', workspaceId: 'w1' })
  expect(parseRoute('/proj/p1')).toEqual({ kind: 'project', projectId: 'p1' })
  expect(parseRoute('/proj/p1/reqs/r1')).toEqual({
    kind: 'requirement',
    projectId: 'p1',
    requirementId: 'r1',
  })
  expect(parseRoute('/proj/p1/tasks/t1')).toEqual({ kind: 'task', projectId: 'p1', taskId: 't1' })
})

test('path builders round-trip through parseRoute', () => {
  expect(parseRoute(workspacePath('w1'))).toEqual({ kind: 'workspace', workspaceId: 'w1' })
  expect(parseRoute(projectPath('p1'))).toEqual({ kind: 'project', projectId: 'p1' })
  expect(parseRoute(requirementPath('p1', 'r1'))).toMatchObject({ requirementId: 'r1' })
  expect(parseRoute(taskPath('p1', 't1'))).toMatchObject({ taskId: 't1' })
})

test('isItemRoute is true only for requirement/task paths', () => {
  expect(isItemRoute('/proj/p1/tasks/t1')).toBe(true)
  expect(isItemRoute('/proj/p1/reqs/r1')).toBe(true)
  expect(isItemRoute('/proj/p1')).toBe(false)
  expect(isItemRoute('/')).toBe(false)
})

test('activeProjectId extracts the project for project-scoped paths', () => {
  expect(activeProjectId('/proj/p1/reqs/r1')).toBe('p1')
  expect(activeProjectId('/proj/p1')).toBe('p1')
  expect(activeProjectId('/ws/w1')).toBeNull()
  expect(activeProjectId('/')).toBeNull()
})
