import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { Id, SessionView } from '@baton/shared'
import type { BindingStore } from './bindings.ts'
import type { BatonClient } from './client.ts'
import { parseCommand, runCommand } from './commands.ts'

const memBindings = (seed: Record<string, Id> = {}): BindingStore => {
  const m = new Map<string, Id>(Object.entries(seed))
  return {
    get: k => m.get(k),
    set: (k, id) => {
      m.set(k, id)
    },
    delete: k => {
      m.delete(k)
    },
  }
}

describe('parseCommand', () => {
  test('parses name + args, lowercases, trims; null for non-commands', () => {
    assert.deepEqual(parseCommand('/clear'), { name: 'clear', args: '' })
    assert.deepEqual(parseCommand('  /CLEAR  '), { name: 'clear', args: '' })
    assert.deepEqual(parseCommand('/model opus 4'), { name: 'model', args: 'opus 4' })
    assert.equal(parseCommand('hello'), null)
    assert.equal(parseCommand('what /clear means'), null)
  })
})

describe('runCommand /clear', () => {
  test('stops the bound session, unbinds, confirms', async () => {
    const stopped: Id[] = []
    const client = {
      stopSession: async (id: Id) => {
        stopped.push(id)
        return {} as SessionView
      },
    } as unknown as BatonClient
    const bindings = memBindings({ 'conv:user': 7 as Id })

    const out = await runCommand({ name: 'clear', args: '' }, { client, bindings, key: 'conv:user' })

    assert.deepEqual(stopped, [7])
    assert.equal(bindings.get('conv:user'), undefined)
    assert.match(out, /清空/)
  })

  test('no session bound → no stop, friendly note', async () => {
    let calls = 0
    const client = {
      stopSession: async () => {
        calls++
        return {} as SessionView
      },
    } as unknown as BatonClient
    const out = await runCommand(
      { name: 'clear', args: '' },
      { client, bindings: memBindings(), key: 'conv:user' },
    )
    assert.equal(calls, 0)
    assert.match(out, /没有会话/)
  })
})

describe('runCommand unknown', () => {
  test('unknown command and /help return the help text', async () => {
    const ctx = { client: {} as BatonClient, bindings: memBindings(), key: 'k' }
    const help = await runCommand({ name: 'help', args: '' }, ctx)
    const unknown = await runCommand({ name: 'nope', args: '' }, ctx)
    assert.match(help, /可用命令/)
    assert.equal(unknown, help)
  })
})
