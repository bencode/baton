import type { Project, Requirement, Task } from '@baton/shared'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Api } from '../api'
import { ApiContext } from './api-context'
import { LeftPanel } from './left-panel'

beforeEach(() => localStorage.clear())
afterEach(cleanup)

const project: Project = { id: 1, workspaceId: 1, name: 'web', createdAt: 0 }
const login: Requirement = {
  id: 1,
  projectId: 1,
  code: 'R-1',
  title: 'User login',
  resources: [],
  status: 'active',
  createdAt: 0,
  updatedAt: 0,
}
// `Implement` (T-2) depends on `Design` (T-1, id 1); arrangeTasks orders Design first.
const tasks: Task[] = [
  {
    id: 2,
    requirementId: 1,
    projectId: 1,
    code: 'T-2',
    title: 'Implement',
    dependsOn: [1],
    status: 'todo',
    createdAt: 2,
    updatedAt: 0,
  },
  {
    id: 1,
    requirementId: 1,
    projectId: 1,
    code: 'T-1',
    title: 'Design',
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
    sessions: { listByProject: vi.fn(async () => []) },
    workers: { listByProject: vi.fn(async () => []) },
  }) as unknown as Api

test('LeftPanel renders the requirement tree (deps + ready) and opens a task on click', async () => {
  const open = vi.fn()
  render(
    <ApiContext.Provider value={fakeApi()}>
      <MemoryRouter>
        <LeftPanel workspaceId={1} projectId={1} activeId="/proj/1" open={open} />
      </MemoryRouter>
    </ApiContext.Provider>,
  )
  expect(await screen.findByText('User login')).toBeTruthy()
  expect(await screen.findByText('Design')).toBeTruthy()
  const impl = await screen.findByText('Implement')
  // Implement depends on the done Design task; row shows ↳ marker + code.
  // 'todo' (default) renders no chip — absence is the baseline. 'done' shows
  // up as a small uppercase 'done' state chip on the right.
  expect(screen.queryByText('todo')).toBeNull()
  expect(screen.getByText('done')).toBeTruthy()
  expect(screen.getByText('↳')).toBeTruthy()
  expect(screen.getByText('T-2')).toBeTruthy()
  expect(screen.getByText('R-1')).toBeTruthy()
  fireEvent.click(impl)
  expect(open).toHaveBeenCalledWith('/proj/1/T-2', 'Implement')
})

test('chevron toggles aria-expanded and the tasks region aria-hidden', async () => {
  const { container } = render(
    <ApiContext.Provider value={fakeApi()}>
      <MemoryRouter>
        <LeftPanel workspaceId={1} projectId={1} activeId="/proj/1" open={vi.fn()} />
      </MemoryRouter>
    </ApiContext.Provider>,
  )
  await screen.findByText('User login')
  const chevron = container.querySelector('[aria-controls="1-tasks"]')
  const region = container.querySelector('#\\31 -tasks')
  expect(chevron?.getAttribute('aria-expanded')).toBe('true')
  expect(region?.getAttribute('aria-hidden')).toBe('false')
  if (chevron) fireEvent.click(chevron)
  expect(chevron?.getAttribute('aria-expanded')).toBe('false')
  expect(region?.getAttribute('aria-hidden')).toBe('true')
  if (chevron) fireEvent.click(chevron)
  expect(chevron?.getAttribute('aria-expanded')).toBe('true')
})
