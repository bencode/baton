import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { Markdown } from './markdown'

const { draw, initialize } = vi.hoisted(() => ({
  draw: vi.fn<(id: string, source: string, container: HTMLElement) => Promise<{ svg: string }>>(),
  initialize: vi.fn(),
}))
vi.mock('mermaid', () => ({ default: { initialize, render: draw } }))
beforeEach(() => draw.mockReset().mockResolvedValue({ svg: '<svg viewBox="0 0 200 100" />' }))
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.doUnmock('./mermaid-diagram')
})

test('renders inline and block math across $, $$, \\( and \\[ delimiters', () => {
  // Two inline forms ($…$, \(…\)) and two display forms (single-line $$…$$, \[…\]);
  // normalizeMath promotes both display forms to .katex-display.
  const text = '行内 $E=mc^2$ 和 \\(a+b\\)\n\n$$\\int_0^1 x\\,dx$$\n\n\\[\\sum_i a_i\\]'
  const { container } = render(<Markdown text={text} />)
  expect(container.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(4)
  expect(container.querySelectorAll('.katex-display').length).toBe(2)
})

test('keeps backslash-parens inside code as literal text, not math', () => {
  const { container } = render(<Markdown text={'use `f\\(x\\)` here'} />)
  expect(container.querySelector('.katex')).toBeNull()
  expect(container.querySelector('code')?.textContent).toBe('f\\(x\\)')
})

test('chat markdown preserves tables, fenced code, safe links, and math', () => {
  const { container, getByRole } = render(
    <Markdown
      variant="chat"
      text={
        '| 名称 | 状态 |\n| --- | --- |\n| test | 正常 |\n\n```ts\nconst x = 1\n```\n\n[参考](https://example.com) 和 $a+b$'
      }
    />,
  )
  expect(getByRole('table').textContent).toContain('正常')
  expect(getByRole('region', { name: '表格，可横向滚动' })).toBeTruthy()
  expect(container.querySelector('pre code')?.textContent).toBe('const x = 1\n')
  expect(getByRole('link', { name: '参考' }).getAttribute('rel')).toBe('noopener noreferrer')
  expect(container.querySelector('.katex')).toBeTruthy()
})

test('only loads complete Mermaid fences and preserves a diagram while the reply streams', async () => {
  const fence = '```mermaid\nflowchart LR\nA --> B'
  const view = render(<Markdown variant="chat" text={fence} />)
  expect(view.container.querySelector('pre')?.textContent).toContain('A --> B')
  expect(initialize).not.toHaveBeenCalled()
  expect(draw).not.toHaveBeenCalled()
  view.rerender(<Markdown variant="chat" text={`${fence}\n\`\`\``} />)
  expect(screen.getByRole('status').textContent).toBe('正在生成图表…')
  const image = await screen.findByRole('img', { name: 'Mermaid 图表' })
  expect(initialize).toHaveBeenCalledWith(
    expect.objectContaining({
      securityLevel: 'strict',
      htmlLabels: false,
      suppressErrorRendering: true,
    }),
  )
  fireEvent.click(screen.getByText('查看源码'))
  view.rerender(<Markdown variant="chat" text={`${fence}\n\`\`\`\n\n继续解释图表。`} />)
  expect(screen.getByRole('img', { name: 'Mermaid 图表' })).toBe(image)
  expect(view.container.querySelector('details')?.open).toBe(true)
  expect(draw).toHaveBeenCalledTimes(1)
})

test.each([
  '~~~~MeRmAiD\nflowchart LR\nA --> B\n~~~~~',
  '> ```mermaid\n> flowchart LR\n> A --> B\n> ```',
  '- ```mermaid\n  flowchart LR\n  A --> B\n  ```',
  '````mermaid\nflowchart LR\nA --> B\n`````',
])('renders closed fences with varied markers and containers: %s', async text => {
  render(<Markdown variant="chat" text={text} />)
  expect(await screen.findByRole('img', { name: 'Mermaid 图表' })).toBeTruthy()
  expect(draw).toHaveBeenCalledWith(
    expect.any(String),
    'flowchart LR\nA --> B',
    expect.any(HTMLElement),
  )
})

test.each([
  '````mermaid\nflowchart LR\nA --> B\n```',
  '~~~mermaid\nflowchart LR\nA --> B\n```',
  '```mermaid\nflowchart LR\nA --> B\n> ```',
])('does not treat a short or mismatched closing marker as complete: %s', text => {
  const view = render(<Markdown variant="chat" text={text} />)
  expect(view.container.querySelector('pre')?.textContent).toContain('A --> B')
  expect(draw).not.toHaveBeenCalled()
})

test.each(['default', 'process'] as const)('keeps Mermaid source unchanged in %s mode', variant => {
  const view = render(
    <Markdown variant={variant} text={'```mermaid\nflowchart LR\nA --> B\n```'} />,
  )
  expect(view.container.querySelector('pre')?.textContent).toBe('flowchart LR\nA --> B\n')
  expect(draw).not.toHaveBeenCalled()
})

test('renders multiple diagrams independently and keeps the surrounding reply', async () => {
  render(
    <Markdown
      variant="chat"
      text={
        'Before\n\n```mermaid\nflowchart LR\nA --> B\n```\n\nBetween\n\n```mermaid\nsequenceDiagram\nA->>B: hello\n```\n\nAfter'
      }
    />,
  )
  expect(await screen.findAllByRole('img', { name: 'Mermaid 图表' })).toHaveLength(2)
  expect(draw).toHaveBeenCalledTimes(2)
  expect(screen.getByText('Before')).toBeTruthy()
  expect(screen.getByText('Between')).toBeTruthy()
  expect(screen.getByText('After')).toBeTruthy()
})

test('a lazy module rejection keeps source and the rest of the reply readable', async () => {
  const failure = new Error('Diagram chunk unavailable')
  vi.resetModules()
  vi.doMock('./mermaid-diagram', () => {
    throw failure
  })
  const report = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const { Markdown: IsolatedMarkdown } = await import('./markdown')
  const view = render(
    <IsolatedMarkdown
      variant="chat"
      text={'Before\n\n```mermaid\nflowchart LR\nA --> B\n```\n\nAfter'}
    />,
  )
  expect((await screen.findByRole('alert')).textContent).toBe('图表未能渲染，已保留源码')
  expect(view.container.querySelector('pre')?.textContent).toContain('A --> B')
  expect(screen.getByText('Before')).toBeTruthy()
  expect(screen.getByText('After')).toBeTruthy()
  await waitFor(() =>
    expect(report).toHaveBeenCalledWith(
      '[mermaid] component loading or rendering failed',
      expect.any(Error),
    ),
  )
})
