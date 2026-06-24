import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ptyArgs, serverTerminalWsUrl } from './pty.ts'

test('ptyArgs resumes an existing JSONL, else starts a fresh session at that id', () => {
  assert.deepEqual(ptyArgs('sid', true), ['--resume', 'sid'])
  assert.deepEqual(ptyArgs('sid', false), ['--session-id', 'sid'])
})

test('serverTerminalWsUrl turns the http(s) server into a ws(s) bridge URL', () => {
  assert.equal(
    serverTerminalWsUrl('http://localhost:3280', 13),
    'ws://localhost:3280/workers/me/terminal/ws?sessionId=13',
  )
  assert.equal(
    serverTerminalWsUrl('https://baton.fmap.dev/api', 7),
    'wss://baton.fmap.dev/api/workers/me/terminal/ws?sessionId=7',
  )
})
