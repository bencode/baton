import type * as Lark from '@larksuiteoapi/node-sdk'

// A lightweight "seen + working" signal: add a Feishu emoji reaction to the
// user's message while the turn runs (mirrors the old rooma bot's OnIt icon).
// Built-in emoji codes: OnIt / DONE / Typing / Get / THUMBSUP / … Both calls are
// best-effort — a reaction failure must never block the actual reply.

export const addReaction = async (
  client: Lark.Client,
  messageId: string,
  emoji = 'OnIt',
): Promise<string | undefined> => {
  try {
    const res = await client.im.messageReaction.create({
      path: { message_id: messageId },
      data: { reaction_type: { emoji_type: emoji } },
    })
    return res.data?.reaction_id
  } catch {
    return undefined
  }
}

export const removeReaction = async (
  client: Lark.Client,
  messageId: string,
  reactionId: string,
): Promise<void> => {
  try {
    await client.im.messageReaction.delete({
      path: { message_id: messageId, reaction_id: reactionId },
    })
  } catch {
    // best-effort; a lingering reaction is harmless
  }
}
