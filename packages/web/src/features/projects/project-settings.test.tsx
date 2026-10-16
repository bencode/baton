import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { Api } from '../../api'
import { ApiContext } from '../../app/api-context'
import { ProjectSettings } from './project-settings'

const project = { id: 1, workspaceId: 2, name: 'alpha', createdAt: 0 }
const fixture = () => {
  const projects = {
    get: vi.fn(async () => project),
    update: vi.fn(async () => project),
    remove: vi.fn(async () => undefined),
    listByWorkspace: vi.fn(async () => [project, { ...project, id: 3 }]),
  }
  const onDeleted = vi.fn()
  render(
    <ApiContext.Provider value={{ projects } as unknown as Api}>
      <ProjectSettings projectId={1} onDeleted={onDeleted} />
    </ApiContext.Provider>,
  )
  return { projects, onDeleted }
}
afterEach(cleanup)

test('saving a project surfaces failure and allows retry without losing the name', async () => {
  const { projects } = fixture()
  projects.update.mockRejectedValueOnce(new Error('Cannot save'))
  const input = await screen.findByLabelText('项目名称')
  fireEvent.change(input, { target: { value: 'renamed' } })
  fireEvent.click(screen.getByText('保存更改'))
  expect((await screen.findByRole('alert')).textContent).toBe('Cannot save')
  expect((input as HTMLInputElement).value).toBe('renamed')
  fireEvent.click(screen.getByText('保存更改'))
  await screen.findByText('已保存')
  expect(projects.update).toHaveBeenLastCalledWith(1, { name: 'renamed' })
})

test('project deletion is confirmed and only closes its tabs after the server succeeds', async () => {
  const { projects, onDeleted } = fixture()
  projects.remove.mockRejectedValueOnce(new Error('Delete failed'))
  fireEvent.click(await screen.findByRole('button', { name: '删除项目' }))
  expect(projects.remove).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('确认删除'))
  await screen.findByText('Delete failed')
  expect(onDeleted).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('确认删除'))
  await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(1, '/proj/3'))
})
