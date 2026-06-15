import { expect, test } from 'vitest'
import { normalizeMath } from './math-normalize'

test('rewrites \\(…\\) to inline $…$', () => {
  expect(normalizeMath('inline \\(a+b\\) end')).toBe('inline $a+b$ end')
})

test('rewrites \\[…\\] to a display $$ fence', () => {
  expect(normalizeMath('x \\[\\sum_i a_i\\] y')).toBe('x \n\n$$\n\\sum_i a_i\n$$\n\n y')
})

test('promotes single-line $$…$$ to a display fence', () => {
  expect(normalizeMath('see $$E=mc^2$$ here')).toBe('see \n\n$$\nE=mc^2\n$$\n\n here')
})

test('leaves inline $…$ and already-fenced $$ blocks untouched', () => {
  expect(normalizeMath('inline $E=mc^2$ only')).toBe('inline $E=mc^2$ only')
  const fenced = 'a\n\n$$\n\\int_0^1 x\\,dx\n$$\n\nb'
  expect(normalizeMath(fenced)).toBe(fenced)
})

test('does not touch backslash-parens or dollars inside code', () => {
  expect(normalizeMath('use `f\\(x\\)` here')).toBe('use `f\\(x\\)` here')
  expect(normalizeMath('```\nre = /\\(\\d+\\)/\n```')).toBe('```\nre = /\\(\\d+\\)/\n```')
})

test('rewrites math around code without disturbing the code', () => {
  expect(normalizeMath('\\(a\\) then `\\(b\\)` then \\(c\\)')).toBe('$a$ then `\\(b\\)` then $c$')
})
