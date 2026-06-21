import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { withRetry } from './retry.ts'

describe('withRetry', () => {
  test('succeeds after transient failures within the try budget', async () => {
    let n = 0
    const r = await withRetry(
      async () => {
        n++
        if (n < 3) throw new Error('flap')
        return 'ok'
      },
      { tries: 4, baseMs: 1 },
    )
    assert.equal(r, 'ok')
    assert.equal(n, 3)
  })

  test('rethrows the last error after exhausting tries', async () => {
    let n = 0
    await assert.rejects(
      withRetry(
        async () => {
          n++
          throw new Error(`flap ${n}`)
        },
        { tries: 3, baseMs: 1 },
      ),
      /flap 3/,
    )
    assert.equal(n, 3) // tried exactly `tries` times
  })

  test('a first-try success does not retry', async () => {
    let n = 0
    const r = await withRetry(
      async () => {
        n++
        return 42
      },
      { tries: 4, baseMs: 1 },
    )
    assert.equal(r, 42)
    assert.equal(n, 1)
  })
})
