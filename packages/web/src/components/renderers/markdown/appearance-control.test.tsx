import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { AppearanceControl } from './appearance-control'
import { defaultMarkdownAppearance, type MarkdownAppearance } from './markdown-appearance'

afterEach(cleanup)

test('each choice in the popover reports the whole next appearance', () => {
  const changes = vi.fn()
  const Controlled = () => {
    const [value, setValue] = useState<MarkdownAppearance>(defaultMarkdownAppearance)
    return (
      <AppearanceControl
        value={value}
        onChange={next => {
          changes(next)
          setValue(next)
        }}
      />
    )
  }
  render(<Controlled />)
  fireEvent.click(screen.getByRole('button', { name: '阅读外观' }))
  fireEvent.click(screen.getByRole('button', { name: /深色/ }))
  fireEvent.click(screen.getByRole('button', { name: '全宽' }))
  fireEvent.change(screen.getByLabelText('字号'), { target: { value: '19' } })
  expect(changes.mock.calls.map(([next]) => next)).toEqual([
    { fontSize: 16, width: 'focused', theme: 'dark' },
    { fontSize: 16, width: 'full', theme: 'dark' },
    { fontSize: 19, width: 'full', theme: 'dark' },
  ])
  expect(screen.getByRole('button', { name: /深色/ }).getAttribute('aria-pressed')).toBe('true')
})
