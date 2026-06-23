import { expect, test } from 'vitest'
import { spliceLabelToken } from './attachment'

test('spliceLabelToken inserts a {label} token at the caret and reports the next caret', () => {
  expect(spliceLabelToken('see here', 8, 8, 'image-1')).toEqual({
    text: 'see here{image-1} ',
    caret: 18,
  })
})

test('spliceLabelToken replaces the active selection', () => {
  // caret over the "X" (indices 4..5) — the token takes its place.
  expect(spliceLabelToken('see X now', 4, 5, 'file-2')).toEqual({
    text: 'see {file-2}  now',
    caret: 13,
  })
})
