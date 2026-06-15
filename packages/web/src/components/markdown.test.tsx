import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { Markdown } from './markdown'

afterEach(cleanup)

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
