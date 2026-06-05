import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { QueryFn } from './query.ts'
import { generateTitle, sanitizeTitle } from './title.ts'

// Fake claude that returns `out` as its result message.
const fakeQuery =
  (out: string): QueryFn =>
  () =>
    (async function* () {
      yield { type: 'result', subtype: 'success', is_error: false, result: out } as never
    })()

describe('sanitizeTitle', () => {
  test('strips quotes / leading label / newlines, collapses + caps', () => {
    assert.equal(sanitizeTitle('Title: "Fix the curl health check"\n'), 'Fix the curl health check')
    assert.equal(sanitizeTitle('  hello   world  '), 'hello world')
    assert.equal(sanitizeTitle('x'.repeat(60)).length, 30)
  })

  test('strips markdown, leading list markers, and trailing punctuation', () => {
    assert.equal(sanitizeTitle('**问题描述确认**：'), '问题描述确认')
    assert.equal(sanitizeTitle('## CardList 联动排查'), 'CardList 联动排查')
    assert.equal(sanitizeTitle('- 发货反馈字段排查。'), '发货反馈字段排查')
    assert.equal(sanitizeTitle('1. 移动端 RecordActions'), '移动端 RecordActions')
  })
})

describe('generateTitle', () => {
  const base = {
    worktreePath: '/tmp',
    userText: 'curl the health endpoint and report status',
    assistantText: 'I will hit /health and report the status.',
  }
  test('uses claude result when present', async () => {
    const t = await generateTitle({ ...base, queryFn: fakeQuery('  Curl Health Check  ') })
    assert.equal(t, 'Curl Health Check')
  })
  test('declines (null) when the model replies NONE', async () => {
    assert.equal(await generateTitle({ ...base, queryFn: fakeQuery('NONE') }), null)
  })
  test('declines (null) when claude emits nothing', async () => {
    assert.equal(await generateTitle({ ...base, queryFn: fakeQuery('') }), null)
  })
  test('declines (null) for a too-thin exchange without calling claude', async () => {
    const spy: QueryFn = () => {
      throw new Error('should not call claude for a trivial exchange')
    }
    assert.equal(
      await generateTitle({
        worktreePath: '/tmp',
        userText: 'hi',
        assistantText: '',
        queryFn: spy,
      }),
      null,
    )
  })
})
