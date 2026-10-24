import type { Attachment } from '@baton/shared'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import type { RenderItem } from '../event-render'
import { EventStream } from './event-stream'

afterEach(cleanup)

test('empty state waits for history confirmation and failures offer retry', () => {
  const retry = vi.fn()
  const props = { items: [], scrollRef: createRef<HTMLDivElement>(), onRetryHistory: retry }
  const view = render(<EventStream {...props} history={{ status: 'loading' }} />)
  expect(screen.getByRole('status').textContent).toBe('正在加载聊天记录…')
  expect(screen.queryByText('从一条消息开始')).toBeNull()
  view.rerender(<EventStream {...props} history={{ status: 'error', message: '网络错误' }} />)
  expect(screen.getByRole('alert').textContent).toContain('网络错误')
  expect(screen.queryByText('从一条消息开始')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '重试' }))
  expect(retry).toHaveBeenCalledOnce()
  view.rerender(<EventStream {...props} history={{ status: 'ready' }} />)
  expect(screen.getByText('从一条消息开始')).toBeTruthy()
})

test('background loading or failure keeps previously loaded answers readable', () => {
  const props = {
    items: [{ kind: 'assistant-text', key: 'answer', text: '已有回答' }] as RenderItem[],
    scrollRef: createRef<HTMLDivElement>(),
  }
  const view = render(<EventStream {...props} history={{ status: 'loading' }} />)
  expect(screen.getByText('已有回答')).toBeTruthy()
  expect(screen.queryByText('正在加载聊天记录…')).toBeNull()
  view.rerender(<EventStream {...props} history={{ status: 'error', message: '更新失败' }} />)
  expect(screen.getByText('已有回答')).toBeTruthy()
  expect(screen.getByRole('alert').textContent).toContain('更新失败')
})

const tool = (key: string, status: 'in_progress' | 'completed' = 'completed'): RenderItem => ({
  kind: 'tool-block',
  key,
  toolUseId: key,
  name: 'Bash',
  input: { command: `command-${key}` },
  status,
  resultText: status === 'completed' ? '' : undefined,
})

test('tools start collapsed, fold once when a run ends, then keep the user choice', () => {
  const props = { scrollRef: createRef<HTMLDivElement>(), working: true }
  const toolOne = () => screen.getByRole('button', { name: /Bash.*command-one/ })
  const { rerender } = render(<EventStream {...props} items={[tool('one', 'in_progress')]} />)
  expect(toolOne().getAttribute('aria-expanded')).toBe('false')
  fireEvent.click(toolOne())
  expect(toolOne().getAttribute('aria-expanded')).toBe('true')
  fireEvent.click(screen.getByRole('button', { name: /正在处理/ }))
  rerender(<EventStream {...props} items={[tool('one'), tool('two')]} />)
  expect(screen.getByRole('button', { name: /正在处理/ }).getAttribute('aria-expanded')).toBe(
    'false',
  )
  fireEvent.click(screen.getByRole('button', { name: /正在处理/ }))
  expect(toolOne().getAttribute('aria-expanded')).toBe('false')
  fireEvent.click(toolOne())
  rerender(<EventStream {...props} working={false} items={[tool('one'), tool('two')]} />)
  expect(screen.getByRole('button', { name: /查看执行过程/ }).getAttribute('aria-expanded')).toBe(
    'true',
  )
  expect(toolOne().getAttribute('aria-expanded')).toBe('true')
  expect(screen.getByText('（空输出）')).toBeTruthy()
})

test('a single process keeps its user-selected group state after completion', () => {
  const props = { scrollRef: createRef<HTMLDivElement>() }
  const { rerender } = render(
    <EventStream {...props} working items={[tool('single', 'in_progress')]} />,
  )
  fireEvent.click(screen.getByRole('button', { name: /正在处理/ }))
  rerender(<EventStream {...props} working={false} items={[tool('single')]} />)
  expect(screen.getByRole('button', { name: /查看执行过程/ }).getAttribute('aria-expanded')).toBe(
    'false',
  )
})

test('interleaved answers stay between process groups and unknown data can be inspected', () => {
  const { container } = render(
    <EventStream
      scrollRef={createRef()}
      items={[
        tool('before'),
        { kind: 'assistant-text', key: 'answer', text: '中间的回答' },
        tool('after'),
        { kind: 'raw', key: 'raw', payload: { future: '完整原文' } },
      ]}
    />,
  )
  const groups = screen.getAllByLabelText('执行过程')
  const answer = screen.getByRole('article', { name: '助手回答' })
  expect(groups[0]!.compareDocumentPosition(answer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(answer.compareDocumentPosition(groups[1]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  const summary = screen.getByText('未识别的事件 · 查看原始数据')
  fireEvent.click(summary)
  expect(container.querySelector('details')?.open).toBe(true)
  expect(container.querySelector('details pre')?.textContent).toContain('完整原文')
})

test('sent image and download attachment retain their source, label and filename', () => {
  const attachment: Attachment = {
    id: 'document',
    sessionId: 1,
    filename: 'design.md',
    contentType: 'text/markdown',
    size: 32,
    url: '/sessions/1/attachments/document',
    createdAt: 0,
  }
  render(
    <EventStream
      scrollRef={createRef()}
      items={[
        {
          kind: 'user-bubble',
          key: 'user',
          text: '请查看文件',
          images: ['data:image/png;base64,AA=='],
          attachments: [attachment],
        },
      ]}
    />,
  )
  const user = screen.getByRole('article', { name: '用户消息' })
  expect(within(user).getByRole('img').getAttribute('src')).toBe('data:image/png;base64,AA==')
  const link = within(user).getByRole('link', { name: /design.md/ })
  expect(link.getAttribute('download')).toBe('design.md')
  expect(link.getAttribute('href')).toContain('/sessions/1/attachments/document')
  expect(link.textContent).toContain('{file-1}')
})

test('disconnected live processes show uncertainty instead of definite progress', () => {
  render(
    <EventStream
      working
      statusKnown={false}
      scrollRef={createRef()}
      items={[tool('pending', 'in_progress')]}
    />,
  )
  expect(screen.queryByText('执行中')).toBeNull()
  expect(screen.queryByText('正在处理')).toBeNull()
  expect(screen.getAllByText('状态待同步').length).toBeGreaterThan(0)
  expect(screen.getByRole('button', { name: /执行过程/ }).getAttribute('aria-expanded')).toBe(
    'true',
  )
})
