import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { MermaidDiagram } from './mermaid-diagram'

const { draw } = vi.hoisted(() => ({
  draw: vi.fn<(id: string, source: string, container: HTMLElement) => Promise<{ svg: string }>>(),
}))
vi.mock('mermaid', () => ({ default: { initialize: vi.fn(), render: draw } }))

const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 200"><text>示意图</text></svg>'
const source = 'flowchart LR\nA --> B'
const code = (
  <pre>
    <code>{source}</code>
  </pre>
)

beforeEach(() => draw.mockReset().mockResolvedValue({ svg }))
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

test('renders an image with intrinsic width and source collapsed by default', async () => {
  const { container } = render(<MermaidDiagram source={source}>{code}</MermaidDiagram>)
  expect(screen.getByRole('status').textContent).toBe('正在生成图表…')
  expect(container.querySelector('pre')?.textContent).toBe(source)
  const image = await screen.findByRole('img', { name: 'Mermaid 图表' })
  expect(image.getAttribute('src')).toBe(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
  )
  expect(image.getAttribute('width')).toBe('640')
  expect(container.querySelector('svg')).toBeNull()
  const details = container.querySelector('details')
  expect(details?.open).toBe(false)
  fireEvent.click(screen.getByText('查看源码'))
  expect(details?.open).toBe(true)
  expect(draw.mock.calls[0]?.[2].isConnected).toBe(false)
})

test('render failures retain source and remove the temporary container', async () => {
  const error = new Error('Invalid diagram')
  draw.mockRejectedValueOnce(error)
  const report = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  const { container } = render(<MermaidDiagram source={source}>{code}</MermaidDiagram>)
  expect((await screen.findByRole('alert')).textContent).toBe('图表未能渲染，已保留源码')
  expect(container.querySelector('pre')?.textContent).toBe(source)
  expect(screen.queryByRole('img')).toBeNull()
  expect(report).toHaveBeenCalledWith('[mermaid] diagram rendering failed', error)
  expect(draw.mock.calls[0]?.[2].isConnected).toBe(false)
})

test('late results do not overwrite a new diagram and both containers are removed', async () => {
  let finishOld!: (value: { svg: string }) => void
  draw.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finishOld = resolve
      }),
  )
  const view = render(<MermaidDiagram source="old">{code}</MermaidDiagram>)
  await waitFor(() => expect(draw).toHaveBeenCalledTimes(1))
  view.rerender(<MermaidDiagram source="new">{code}</MermaidDiagram>)
  const image = await screen.findByRole('img', { name: 'Mermaid 图表' })
  const current = image.getAttribute('src')
  await act(async () => {
    finishOld({ svg: '<svg><text>Old</text></svg>' })
  })
  expect(image.getAttribute('src')).toBe(current)
  expect(draw.mock.calls.every(([, , host]) => !host.isConnected)).toBe(true)
  expect(draw.mock.calls[0]?.[0]).not.toBe(draw.mock.calls[1]?.[0])
})
