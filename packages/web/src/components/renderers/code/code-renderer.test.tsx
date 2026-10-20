import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, expect, test, vi } from 'vitest'
import { CodeRenderer } from './code-renderer'

afterEach(cleanup)

// jsdom lays nothing out; CodeMirror still measures text ranges when it gets the chance.
beforeAll(() => {
  Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList
  Range.prototype.getBoundingClientRect ??= () => new DOMRect()
})

const content = () => document.querySelector('.cm-content')

test('code reads with its language, line numbers, and wrapping switched in place', async () => {
  const { container, rerender } = render(
    <CodeRenderer name="app.ts" content={'const answer = 42\n'} wrap={false} />,
  )
  await vi.waitFor(() => expect(document.querySelector('.tok-keyword')?.textContent).toBe('const'))
  expect(content()?.textContent).toContain('const answer = 42')
  expect(document.querySelector('.cm-lineNumbers')).toBeTruthy()
  expect(content()?.getAttribute('aria-readonly')).toBe('true')
  // One fixed editor look: nothing carries a document reading theme.
  expect(container.querySelector('[data-reading-theme]')).toBeNull()
  const editor = document.querySelector('.cm-editor')
  expect(content()?.classList.contains('cm-lineWrapping')).toBe(false)
  rerender(<CodeRenderer name="app.ts" content={'const answer = 42\n'} wrap />)
  expect(content()?.classList.contains('cm-lineWrapping')).toBe(true)
  expect(document.querySelector('.cm-editor')).toBe(editor)
})

test('a file name no grammar claims reads as plain text', async () => {
  render(<CodeRenderer name="todo.unknownext" content="const plain = true" wrap={false} />)
  await vi.waitFor(() => expect(content()?.textContent).toContain('const plain = true'))
  expect(document.querySelector('[class*="tok-"]')).toBeNull()
})
