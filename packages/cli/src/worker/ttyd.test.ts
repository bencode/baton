import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildTtydArgs, exposeNetwork, terminalBase } from './ttyd.ts'

const base = {
  port: 8901,
  worktreePath: '/wt',
  agentSessionId: 'sid',
  claudeBin: 'claude',
}

test('buildTtydArgs binds loopback by default; binds all interfaces only when exposed', () => {
  const loopback = buildTtydArgs({ ...base, exposeNetwork: false })
  assert.equal(loopback[loopback.indexOf('-i') + 1], '127.0.0.1', 'safe default = -i 127.0.0.1')

  const exposed = buildTtydArgs({ ...base, exposeNetwork: true })
  assert.ok(!exposed.includes('-i'), 'no -i when exposed (ttyd binds all interfaces)')
})

test('buildTtydArgs carries --once/-W, the resume-or-new script, and the positional args', () => {
  const args = buildTtydArgs({ ...base, exposeNetwork: false, claudeBin: 'mybin' })
  assert.ok(args.includes('--once') && args.includes('-W'))
  assert.deepEqual(args.slice(0, 2), ['-p', '8901'])
  const script = args[args.indexOf('-c') + 1]
  assert.ok(script, 'argv carries a -c bash script')
  assert.match(script, /--resume "\$2"/) // existing JSONL → resume
  assert.match(script, /--session-id "\$2"/) // else fresh session at that id
  // tail: bash -c <script> $0=baton $1=worktree $2=agentSessionId $3=claudeBin
  assert.deepEqual(args.slice(-4), ['baton', '/wt', 'sid', 'mybin'])
})

test('terminalBase / exposeNetwork follow BATON_TERMINAL_BASE', () => {
  assert.equal(terminalBase({}), 'http://127.0.0.1')
  assert.equal(exposeNetwork({}), false)
  const env = { BATON_TERMINAL_BASE: 'http://macmini.local' } as NodeJS.ProcessEnv
  assert.equal(terminalBase(env), 'http://macmini.local')
  assert.equal(exposeNetwork(env), true)
})
