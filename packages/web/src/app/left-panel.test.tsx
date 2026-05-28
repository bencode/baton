import type { Project, Requirement, Task } from '@baton/shared'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Api } from '../api'
import { ApiContext } from './api-context'
import { LeftPanel } from './left-panel'

beforeEach(() => localStorage.clear())
afterEach(cleanup)

const project: Project = { id: 'p1', workspaceId: 'w1', name: 'web', createdAt: 0 }
const login: Requirement = {
  id: 'r1',
  projectId: 'p1',
  title: 'User login',
  resources: [],
  tags: [],
  status: 'active',
  createdAt: 0,
  updatedAt: 0,
}
const tasks: Task[] = [
  {
    id: 't-impl',
    requirementId: 'r1',
    title: 'Implement',
    requires: [],
    dependsOn: ['t-design'],
    status: 'todo',
    createdAt: 2,
    updatedAt: 0,
  },
  {
    id: 't-design',
    requirementId: 'r1',
    title: 'Design',
    requires: [],
    dependsOn: [],
    status: 'done',
    createdAt: 1,
    updatedAt: 0,
  },
]

const fakeApi = () =>
  ({
    projects: { listByWorkspace: vi.fn(async () => [project]), get: vi.fn(async () => project) },
    requirements: { listByProject: vi.fn(async () => [login]) },
    tasks: { listByRequirement: vi.fn(async () => tasks) },
  }) as unknown as Api

test('LeftPanel renders the requirement tree (deps + ready) and opens a task on click', async () => {
  const open = vi.fn()
  render(
    <ApiContext.Provider value={fakeApi()}>
      <MemoryRouter>
        <LeftPanel workspaceId="w1" projectId="p1" activeId="/proj/p1" open={open} />
      </MemoryRouter>
    </ApiContext.Provider>,
  )
  expect(await screen.findByText('User login')).toBeTruthy()
  expect(await screen.findByText('Design')).toBeTruthy()
  const impl = await screen.findByText('Implement')
  // Implement depends on the done Design task; row shows status dot + ↳ marker.
  expect(screen.getByLabelText('todo')).toBeTruthy()
  expect(screen.getByText('↳')).toBeTruthy()
  fireEvent.click(impl)
  expect(open).toHaveBeenCalledWith('/proj/p1/tasks/t-impl', 'Implement')
})

test('chevron toggles aria-expanded and the tasks region aria-hidden', async () => {
  const { container } = render(
    <ApiContext.Provider value={fakeApi()}>
      <MemoryRouter>
        <LeftPanel workspaceId="w1" projectId="p1" activeId="/proj/p1" open={vi.fn()} />
      </MemoryRouter>
    </ApiContext.Provider>,
  )
  await screen.findByText('User login')
  const chevron = container.querySelector('[aria-controls="r1-tasks"]')
  const region = container.querySelector('#r1-tasks')
  expect(chevron?.getAttribute('aria-expanded')).toBe('true')
  expect(region?.getAttribute('aria-hidden')).toBe('false')
  if (chevron) fireEvent.click(chevron)
  expect(chevron?.getAttribute('aria-expanded')).toBe('false')
  expect(region?.getAttribute('aria-hidden')).toBe('true')
  if (chevron) fireEvent.click(chevron)
  expect(chevron?.getAttribute('aria-expanded')).toBe('true')
})
