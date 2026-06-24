import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { WSContext } from 'hono/ws'
import { createTerminalBridge } from './terminal-bridge.ts'

type FakeWS = { sent: string[]; closed: boolean; throwOnSend: boolean }

// A WSContext stub recording what it sent / whether it was closed. `throwOnSend`
// simulates a socket that left OPEN (closing) before its onClose reaped it.
const makeWS = (throwOnSend = false): WSContext & FakeWS => {
  const ws: FakeWS = { sent: [], closed: false, throwOnSend }
  return Object.assign(ws, {
    send: (d: string) => {
      if (ws.throwOnSend) throw new Error('WebSocket is not open')
      ws.sent.push(d)
    },
    close: () => {
      ws.closed = true
    },
  }) as unknown as WSContext & FakeWS
}

test('attachWorker replacing a stale worker keeps viewers and survives the old onClose', () => {
  const b = createTerminalBridge()
  const w1 = makeWS()
  const v = makeWS()
  b.attachWorker(1, 10, w1)
  assert.equal(b.attachViewer(1, v), true)
  b.attachWorker(1, 10, makeWS()) // worker reconnects
  assert.equal(w1.closed, true) // stale pty side dropped
  b.detach(1, w1) // the OLD worker's onClose must not wipe the new entry
  assert.equal(b.isOpen(1), true)
  b.toViewers(1, 'x')
  assert.deepEqual(v.sent, ['x']) // viewer preserved across the swap
})

test('detach on the worker side tears the terminal down and closes viewers', () => {
  const b = createTerminalBridge()
  const w = makeWS()
  const v = makeWS()
  b.attachWorker(2, 10, w)
  b.attachViewer(2, v)
  b.detach(2, w)
  assert.equal(b.isOpen(2), false)
  assert.equal(v.closed, true)
})

test('detach on a viewer side keeps the terminal open for the others', () => {
  const b = createTerminalBridge()
  b.attachWorker(3, 10, makeWS())
  const v1 = makeWS()
  const v2 = makeWS()
  b.attachViewer(3, v1)
  b.attachViewer(3, v2)
  b.detach(3, v1)
  assert.equal(b.isOpen(3), true)
  b.toViewers(3, 'y')
  assert.deepEqual(v1.sent, []) // detached viewer no longer receives
  assert.deepEqual(v2.sent, ['y'])
})

test('toViewers keeps broadcasting past a viewer whose send throws', () => {
  const b = createTerminalBridge()
  b.attachWorker(4, 10, makeWS())
  const dead = makeWS(true) // its send throws (socket closing)
  const live = makeWS()
  b.attachViewer(4, dead)
  b.attachViewer(4, live)
  b.toViewers(4, 'z') // must not abort on `dead`
  assert.deepEqual(live.sent, ['z'])
})

test('reapIdle closes viewerless terminals and spares ones with a viewer', () => {
  const b = createTerminalBridge()
  const wIdle = makeWS()
  b.attachWorker(5, 10, wIdle) // no viewer
  b.attachWorker(6, 10, makeWS())
  b.attachViewer(6, makeWS())
  const closed = b.reapIdle(-1) // cutoff in the future → any viewerless terminal is idle
  assert.deepEqual(closed, [5])
  assert.equal(b.isOpen(5), false)
  assert.equal(wIdle.closed, true)
  assert.equal(b.isOpen(6), true) // a viewer is watching → spared
})
