import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { contentTypeForPath } from './mime.ts'

describe('contentTypeForPath', () => {
  test('uses the MIME database and keeps an octet-stream fallback', () => {
    assert.equal(
      contentTypeForPath('report.xlsx'),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    assert.equal(contentTypeForPath('unknown.baton-no-such-extension'), 'application/octet-stream')
  })
})
