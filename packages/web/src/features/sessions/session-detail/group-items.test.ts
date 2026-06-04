import { describe, expect, test } from 'vitest'
import type { RenderItem } from '../event-render'
import { type ActivityGroup, groupRenderItems, groupSummary } from './group-items'

const tool = (key: string, name = 'Bash', isError = false): RenderItem => ({
  kind: 'tool-block',
  name,
  input: {},
  toolUseId: key,
  isError,
  key,
})
const thinking = (key: string): RenderItem => ({ kind: 'thinking', text: 'hm', key })
const text = (key: string): RenderItem => ({ kind: 'assistant-text', text: 'answer', key })

describe('groupRenderItems', () => {
  test('folds consecutive tool/thinking runs; assistant-text flushes', () => {
    const out = groupRenderItems(
      [tool('t1'), thinking('th1'), tool('t2'), text('a1'), tool('t3'), thinking('th2')],
      false,
    )
    expect(out.map(i => i.kind)).toEqual(['activity-group', 'assistant-text', 'activity-group'])
    const first = out[0] as ActivityGroup
    expect(first.items.map(i => i.key)).toEqual(['t1', 'th1', 't2'])
    expect(first.live).toBe(false)
  })

  test('only the trailing group of a working session is live', () => {
    const out = groupRenderItems(
      [tool('t1'), thinking('th1'), text('a1'), tool('t2'), tool('t3')],
      true,
    )
    const [first, , last] = out as [ActivityGroup, RenderItem, ActivityGroup]
    expect(first.live).toBe(false)
    expect(last.live).toBe(true)
  })

  test('a lone historical process item stays plain; a lone live one still groups', () => {
    expect(groupRenderItems([tool('t1'), text('a1')], false).map(i => i.kind)).toEqual([
      'tool-block',
      'assistant-text',
    ])
    expect(groupRenderItems([tool('t1')], true).map(i => i.kind)).toEqual(['activity-group'])
  })
})

describe('groupSummary', () => {
  test('counts per tool, thinking last, failures surfaced', () => {
    const g = groupRenderItems(
      [tool('t1'), tool('t2', 'Bash', true), thinking('th1'), tool('t3', 'Read')],
      false,
    )[0] as ActivityGroup
    expect(groupSummary(g)).toEqual({
      steps: 4,
      parts: ['2 Bash', '1 Read', '1 thinking'],
      failed: 1,
    })
  })
})
