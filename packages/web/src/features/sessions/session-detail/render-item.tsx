import type { RenderItem } from '../event-render'
import { AssistantBubble, UserBubble } from './render-item/bubbles'
import { RawBlock, SystemHeader, SystemNotice } from './render-item/system'
import { ThinkingBlock } from './render-item/thinking-block'
import { TurnDivider } from './render-item/turn-divider'
import { ToolBlock } from './tool-block'

export const RenderItemView = ({ item }: { item: RenderItem }) => {
  if (item.kind === 'system-header')
    return <SystemHeader model={item.model} sessionId={item.sessionId} />
  if (item.kind === 'user-bubble')
    return <UserBubble text={item.text} images={item.images} attachments={item.attachments} />
  if (item.kind === 'assistant-text') return <AssistantBubble text={item.text} />
  if (item.kind === 'tool-block')
    return (
      <ToolBlock
        name={item.name}
        input={item.input}
        resultText={item.resultText}
        isError={item.isError}
      />
    )
  if (item.kind === 'turn-end')
    return (
      <TurnDivider
        variant="success"
        turnIndex={item.turnIndex}
        result={item.result}
        rateLimit={item.rateLimit}
      />
    )
  if (item.kind === 'turn-error')
    return (
      <TurnDivider
        variant="error"
        turnIndex={item.turnIndex}
        message={item.message}
        rateLimit={item.rateLimit}
      />
    )
  if (item.kind === 'thinking') return <ThinkingBlock text={item.text} />
  if (item.kind === 'system-notice') return <SystemNotice text={item.text} />
  return <RawBlock payload={item.payload} />
}
