import type { RenderItem, TurnEndSummary } from '../event-render'
import { Markdown } from './markdown'
import { ToolBlock } from './tool-block'

export const RenderItemView = ({ item }: { item: RenderItem }) => {
  if (item.kind === 'system-header')
    return <SystemHeader model={item.model} sessionId={item.sessionId} />
  if (item.kind === 'user-bubble') return <UserBubble text={item.text} images={item.images} />
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
  if (item.kind === 'turn-end') return <TurnEnd result={item.result} />
  if (item.kind === 'turn-error') return <TurnErrorRow message={item.message} />
  return <RawBlock payload={item.payload} />
}

const SystemHeader = ({ model, sessionId }: { model?: string; sessionId?: string }) => (
  <div className="flex items-center justify-center gap-2 text-[11px] text-gray-400">
    <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 font-mono">
      {model ?? 'claude'}
    </span>
    {sessionId && <span className="font-mono">session {sessionId.slice(0, 8)}</span>}
  </div>
)

const UserBubble = ({ text, images }: { text: string; images?: string[] }) => (
  <div className="flex justify-end">
    <div className="flex max-w-prose flex-col gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm whitespace-pre-wrap text-gray-900">
      {text && <span>{text}</span>}
      {images?.map(src => (
        // biome-ignore lint/a11y/useAltText: pasted screenshot, no caption available
        <img
          key={src.slice(0, 64)}
          src={src}
          className="max-h-80 max-w-full rounded border border-blue-200"
        />
      ))}
    </div>
  </div>
)

const AssistantBubble = ({ text }: { text: string }) => (
  <div className="flex justify-start">
    <div className="max-w-prose rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm">
      <Markdown text={text} />
    </div>
  </div>
)

const TurnEnd = ({ result }: { result?: TurnEndSummary }) => (
  <div className="flex items-center justify-center gap-2 text-[11px] text-gray-400">
    <span>turn done</span>
    {result?.numTurns !== undefined && <span>· {result.numTurns} turn(s)</span>}
    {result?.totalCostUsd !== undefined && <span>· ${result.totalCostUsd.toFixed(4)}</span>}
    {result?.subtype && result.subtype !== 'success' && (
      <span className="text-red-600">· {result.subtype}</span>
    )}
  </div>
)

const TurnErrorRow = ({ message }: { message: string }) => (
  <div className="flex justify-center">
    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700">
      turn error: {message}
    </div>
  </div>
)

const RawBlock = ({ payload }: { payload: unknown }) => (
  <pre className="overflow-x-auto rounded border border-gray-100 bg-white p-2 font-mono text-[11px] whitespace-pre-wrap break-words text-gray-500">
    {JSON.stringify(payload, null, 2)}
  </pre>
)
