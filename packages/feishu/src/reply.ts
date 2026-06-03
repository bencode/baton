import type * as Lark from '@larksuiteoapi/node-sdk'

// Reply into the Feishu conversation via the message API. Unlike DingTalk (which
// hands a per-message webhook), Feishu sends with the app's tenant token — the
// SDK Client manages that from appId/appSecret. We send a plain text message
// (Feishu auto-linkifies URLs, so the session link is clickable inline).
export const reply = async (client: Lark.Client, chatId: string, text: string): Promise<void> => {
  await client.im.message.create({
    params: { receive_id_type: 'chat_id' },
    data: {
      receive_id: chatId,
      msg_type: 'text',
      content: JSON.stringify({ text }),
    },
  })
}
