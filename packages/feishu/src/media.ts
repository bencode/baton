import type * as Lark from '@larksuiteoapi/node-sdk'

// Resolve a Feishu message image (an `image_key`) to its bytes via the SDK's
// im.messageResource.get — auth rides the lark client's app credentials, so
// unlike DingTalk there's no token dance here. The resource is scoped to the
// message it arrived in, hence the messageId parameter.
export type DownloadedImage = { filename: string; contentType: string; body: Uint8Array }

// Map a content-type to a filename extension ("image/jpeg; charset=…" → jpeg).
export const extFromContentType = (contentType: string): string => {
  const sub = contentType.split('/')[1]?.split(';')[0]?.trim()
  return sub || 'png'
}

export const downloadImage = async (
  lark: Lark.Client,
  messageId: string,
  fileKey: string,
  index: number,
): Promise<DownloadedImage> => {
  const res = await lark.im.messageResource.get({
    params: { type: 'image' },
    path: { message_id: messageId, file_key: fileKey },
  })
  const chunks: Buffer[] = []
  for await (const chunk of res.getReadableStream()) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const body = new Uint8Array(Buffer.concat(chunks))
  const headers = res.headers as { get?: (k: string) => string | null } & Record<string, unknown>
  const contentType =
    (typeof headers?.get === 'function'
      ? headers.get('content-type')
      : (headers?.['content-type'] as string | undefined)) ?? 'image/png'
  return { filename: `feishu-${index}.${extFromContentType(contentType)}`, contentType, body }
}
