import { expect, test } from 'vitest'
import { defaultReadingPreferences, parseReadingPreferences } from './reading-preferences'

test('stored reading preferences are validated field by field', () => {
  expect(parseReadingPreferences(null)).toEqual(defaultReadingPreferences)
  expect(parseReadingPreferences('not json')).toEqual(defaultReadingPreferences)
  expect(
    parseReadingPreferences('{"fontSize":18,"width":"full","theme":"paper","wrap":true}'),
  ).toEqual({ fontSize: 18, width: 'full', theme: 'paper', wrap: true })
  expect(parseReadingPreferences('{"fontSize":40,"width":"wide","theme":"dark","wrap":1}')).toEqual(
    { ...defaultReadingPreferences, theme: 'dark' },
  )
})
