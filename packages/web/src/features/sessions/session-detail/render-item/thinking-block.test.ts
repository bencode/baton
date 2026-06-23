import { describe, expect, test } from 'vitest'
import { thinkingPreview } from './thinking-block'

describe('thinkingPreview', () => {
  test('first non-empty line, clipped', () => {
    expect(thinkingPreview('\n\n现在我明白问题了！\n后续推理…')).toBe('现在我明白问题了！')
    expect(thinkingPreview(`${'长'.repeat(80)}\nrest`, 60)).toBe(`${'长'.repeat(60)}…`)
    expect(thinkingPreview('')).toBe('')
  })
})
