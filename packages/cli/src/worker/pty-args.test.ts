import assert from 'node:assert/strict'
import { test } from 'node:test'
import { claudePtyCommand, codexPtyCommand, serverTerminalWsUrl } from './pty.ts'

test('Claude terminal resumes an existing JSONL, else starts a fresh session at that id', () => {
  assert.deepEqual(claudePtyCommand('sid', true, {}), {
    file: 'claude',
    args: ['--resume', 'sid'],
  })
  assert.deepEqual(claudePtyCommand('sid', false, { BATON_CLAUDE_BIN: '/bin/reclaude' }), {
    file: '/bin/reclaude',
    args: ['--session-id', 'sid'],
  })
})

test('Codex terminal resumes an exec session through the configured CLI', () => {
  assert.deepEqual(codexPtyCommand('thread-id', { BATON_CODEX_BIN: '/bin/codex' }), {
    file: '/bin/codex',
    args: ['resume', '--include-non-interactive', 'thread-id'],
  })

  const packaged = codexPtyCommand('thread-id', {})
  assert.equal(packaged.file, process.execPath)
  assert.match(packaged.args[0] ?? '', /@openai\/codex\/bin\/codex\.js$/)
  assert.deepEqual(packaged.args.slice(1), ['resume', '--include-non-interactive', 'thread-id'])
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
