import assert from 'node:assert/strict'
import { test } from 'node:test'
import { type Attachment, isImageAttachment, labelAttachments } from './attachment.ts'

const att = (contentType: string): Attachment => ({
  id: 'x',
  sessionId: 1,
  filename: 'f',
  contentType,
  size: 0,
  url: '/u',
  createdAt: 0,
})

test('isImageAttachment keys off the content type prefix', () => {
  assert.equal(isImageAttachment(att('image/png')), true)
  assert.equal(isImageAttachment(att('application/pdf')), false)
})

test('labelAttachments numbers images and files separately, preserving order', () => {
  const labels = labelAttachments([att('image/png'), att('image/jpeg'), att('application/pdf')])
  assert.deepEqual(labels, ['image-1', 'image-2', 'file-1'])
})
