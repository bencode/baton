import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hashPassword, verifyPassword } from './password.ts'

test('password: hash → verify roundtrip, rejects wrong/garbage', () => {
  const stored = hashPassword('hunter2')
  assert.match(stored, /^[0-9a-f]+:[0-9a-f]+$/)
  assert.equal(verifyPassword('hunter2', stored), true)
  assert.equal(verifyPassword('hunter3', stored), false)
  // distinct salt each call → distinct stored value for the same password
  assert.notEqual(hashPassword('hunter2'), stored)
  // malformed stored values never verify (no crash)
  assert.equal(verifyPassword('x', 'not-a-valid-hash'), false)
  assert.equal(verifyPassword('x', ''), false)
})
