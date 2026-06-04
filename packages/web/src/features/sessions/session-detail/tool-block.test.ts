import { describe, expect, test } from 'vitest'
import { thinkingPreview } from './render-item'
import { stripEnvAssignments, truncateMiddle } from './tool-block'

describe('stripEnvAssignments', () => {
  test('strips leading KEY=VALUE runs so the verb leads', () => {
    expect(
      stripEnvAssignments(
        'TCOLLAB_CHANNEL_ID=VSrqjlG_6 tcollab-bridge call node.get \'[{"k":1}]\'',
      ),
    ).toBe('tcollab-bridge call node.get \'[{"k":1}]\'')
    expect(stripEnvAssignments('A=1 B=2 cmd --flag')).toBe('cmd --flag')
  })
  test('leaves commands without env prefix (and mid-command =) alone', () => {
    expect(stripEnvAssignments('git config user.name=x')).toBe('git config user.name=x')
    expect(stripEnvAssignments('ls -la')).toBe('ls -la')
  })
})

describe('truncateMiddle', () => {
  test('keeps head and differentiating tail, elides the middle', () => {
    const s = `prefix-${'x'.repeat(200)}-TAIL`
    const out = truncateMiddle(s, 120)
    expect(out.length).toBeLessThan(s.length)
    expect(out.startsWith('prefix-')).toBe(true)
    expect(out.endsWith('-TAIL')).toBe(true)
    expect(out).toContain(' … ')
  })
  test('short strings pass through', () => {
    expect(truncateMiddle('short', 120)).toBe('short')
  })
})

describe('thinkingPreview', () => {
  test('first non-empty line, clipped', () => {
    expect(thinkingPreview('\n\n现在我明白问题了！\n后续推理…')).toBe('现在我明白问题了！')
    expect(thinkingPreview(`${'长'.repeat(80)}\nrest`, 60)).toBe(`${'长'.repeat(60)}…`)
    expect(thinkingPreview('')).toBe('')
  })
})
