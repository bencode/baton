import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseInbound } from './stream.ts'

// Build a raw im.message.receive_v1 payload (content is a JSON string per Feishu).
const ev = (message_type: string, content: unknown, over: Record<string, unknown> = {}) => ({
  sender: { sender_id: { open_id: 'ou_alice', user_id: 'u1', union_id: 'on_x' } },
  message: {
    chat_id: 'oc_chat',
    message_id: 'om_1',
    chat_type: 'p2p',
    message_type,
    content: JSON.stringify(content),
    ...over,
  },
})

test('parseInbound: text message', () => {
  const m = parseInbound(ev('text', { text: 'hello' }))
  assert.deepEqual(m, {
    conversationId: 'oc_chat',
    senderId: 'ou_alice',
    sender: 'ou_alice',
    messageId: 'om_1',
    text: 'hello',
    imageCodes: [],
  })
})

test('parseInbound: strips @_user_N mention placeholders', () => {
  const m = parseInbound(ev('text', { text: '@_user_1  看一下代码' }))
  assert.equal(m?.text, '看一下代码')
})

test('parseInbound: image message → image_key in imageCodes, empty text', () => {
  const m = parseInbound(ev('image', { image_key: 'img_xyz' }))
  assert.equal(m?.text, '')
  assert.deepEqual(m?.imageCodes, ['img_xyz'])
})

test('parseInbound: post (rich text) flattens text + collects img keys', () => {
  const post = {
    title: 't',
    content: [
      [
        { tag: 'text', text: 'see ' },
        { tag: 'a', text: 'link', href: 'https://x' },
      ],
      [{ tag: 'img', image_key: 'img_1' }],
    ],
  }
  const m = parseInbound(ev('post', post))
  assert.equal(m?.text, 'see link')
  assert.deepEqual(m?.imageCodes, ['img_1'])
})

test('parseInbound: senderId falls back open_id → user_id → union_id', () => {
  const raw = ev('text', { text: 'hi' })
  // drop open_id + user_id → union_id wins
  ;(raw.sender.sender_id as Record<string, unknown>).open_id = ''
  ;(raw.sender.sender_id as Record<string, unknown>).user_id = ''
  assert.equal(parseInbound(raw)?.senderId, 'on_x')
})

test('parseInbound: unsupported type / malformed → null', () => {
  assert.equal(parseInbound(ev('audio', { file_key: 'f' })), null)
  assert.equal(parseInbound({ message: { chat_id: 'c', content: 'not-json' } }), null)
  assert.equal(parseInbound(null), null)
  assert.equal(parseInbound({ message: { message_type: 'text' } }), null) // no chat_id/sender
})
