import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseInbound } from './stream.ts'

const base = { conversationId: 'c1', senderNick: 'alice', sessionWebhook: 'https://hook' }

test('parseInbound: plain text message', () => {
  const m = parseInbound({ ...base, msgtype: 'text', text: { content: 'hello' } })
  assert.deepEqual(m, {
    conversationId: 'c1',
    sender: 'alice',
    sessionWebhook: 'https://hook',
    text: 'hello',
    imageCodes: [],
  })
})

test('parseInbound: richText extracts text + image downloadCodes', () => {
  const m = parseInbound({
    ...base,
    msgtype: 'richText',
    content: {
      richText: [
        { text: '看这张 ' },
        { type: 'picture', downloadCode: 'code-1' },
        { text: '图' },
        { type: 'picture', downloadCode: 'code-2' },
      ],
    },
  })
  assert.equal(m?.text, '看这张 图')
  assert.deepEqual(m?.imageCodes, ['code-1', 'code-2'])
})

test('parseInbound: image-only richText → empty text, codes kept', () => {
  const m = parseInbound({
    ...base,
    msgtype: 'richText',
    content: { richText: [{ type: 'picture', downloadCode: 'only' }] },
  })
  assert.equal(m?.text, '')
  assert.deepEqual(m?.imageCodes, ['only'])
})

test('parseInbound: unsupported / malformed → null', () => {
  assert.equal(parseInbound({ ...base, msgtype: 'audio' }), null)
  assert.equal(parseInbound(null), null)
  assert.equal(parseInbound({ msgtype: 'richText' }), null)
})
