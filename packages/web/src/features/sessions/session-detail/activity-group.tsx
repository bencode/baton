import { useId, useState } from 'react'
import { type ActivityGroup, groupSummary, nodeTone } from './group-items'
import { ThinkingBlock } from './render-item/thinking-block'
import { Caret, ToolBlock } from './tool-block'

export const ActivityGroupView = ({
  group,
  statusKnown = true,
}: {
  group: ActivityGroup
  statusKnown?: boolean
}) => {
  const [choice, setChoice] = useState<boolean | null>(null)
  const id = useId()
  const open = choice ?? group.live
  const { parts, failed } = groupSummary(group)
  return (
    <section className="chat-process" aria-label="执行过程">
      <button
        type="button"
        className="chat-process-summary ui-focus"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setChoice(!open)}
      >
        <Caret open={open} />
        <span className="chat-process-label">
          {group.live ? (statusKnown ? '正在处理' : '执行过程') : '查看执行过程'}
        </span>
        <span className="chat-process-description">{parts.join(' · ')}</span>
        {failed > 0 && <span className="chat-status-error">{failed} 项失败</span>}
        {group.live && (
          <span className={statusKnown ? 'chat-status-running' : 'chat-status-muted'}>
            {statusKnown ? '执行中' : '状态待同步'}
          </span>
        )}
      </button>
      <div id={id} hidden={!open} className="chat-process-body">
        {group.items.map(item => (
          <div
            key={item.key}
            className="chat-process-step"
            data-tone={nodeTone(item, group.live, statusKnown)}
          >
            {item.kind === 'tool-block' ? (
              <ToolBlock
                name={item.name}
                input={item.input}
                resultText={item.resultText}
                isError={item.isError}
                status={item.status}
                live={group.live}
                statusKnown={statusKnown}
                bare
              />
            ) : (
              <ThinkingBlock text={item.text} bare />
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
