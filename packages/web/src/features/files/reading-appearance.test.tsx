import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test } from 'vitest'
import { MarkdownReader } from './markdown-reader'
import { ReadingAppearance } from './reading-appearance'
import { defaultReadingPreferences, parseReadingPreferences } from './reading-preferences'

afterEach(cleanup)

test('stored reading preferences are validated field by field', () => {
  expect(parseReadingPreferences(null)).toEqual(defaultReadingPreferences)
  expect(parseReadingPreferences('not json')).toEqual(defaultReadingPreferences)
  expect(
    parseReadingPreferences('{"fontSize":18,"width":"full","theme":"paper","wrap":true}'),
  ).toEqual({ fontSize: 18, width: 'full', theme: 'paper', wrap: true })
  expect(parseReadingPreferences('{"fontSize":40,"width":"wide","theme":"dark","wrap":1}')).toEqual(
    {
      ...defaultReadingPreferences,
      theme: 'dark',
    },
  )
})

test('the appearance popover restyles open documents and remembers the choice', () => {
  const route = {
    kind: 'file',
    projectId: 1,
    workerId: 2,
    branch: 'main',
    path: 'README.md',
  } as const
  const { container } = render(
    <MemoryRouter>
      <ReadingAppearance />
      <MarkdownReader route={route} content="# Title" />
    </MemoryRouter>,
  )
  const surface = () => container.querySelector('.reader-surface')
  fireEvent.click(screen.getByRole('button', { name: '阅读外观' }))
  fireEvent.click(screen.getByRole('button', { name: /深色/ }))
  fireEvent.click(screen.getByRole('button', { name: '全宽' }))
  fireEvent.change(screen.getByLabelText('字号'), { target: { value: '19' } })
  expect(surface()?.getAttribute('data-reading-theme')).toBe('dark')
  expect(surface()?.getAttribute('data-reading-width')).toBe('full')
  expect((surface() as HTMLElement).style.getPropertyValue('--reader-font-size')).toBe('19px')
  expect(parseReadingPreferences(localStorage.getItem('baton.reader.preferences'))).toEqual({
    fontSize: 19,
    width: 'full',
    theme: 'dark',
    wrap: false,
  })
})
