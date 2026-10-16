export const WorkingIndicator = ({
  onAbort,
  statusKnown = true,
}: {
  onAbort: () => void
  statusKnown?: boolean
}) => (
  <div className="chat-working-bar">
    <span className="chat-working-label" role="status">
      <span
        aria-hidden="true"
        className={statusKnown ? 'chat-working-dot animate-breathe' : 'chat-working-dot'}
      />
      {statusKnown ? '正在处理…' : '等待状态同步…'}
    </span>
    <button type="button" onClick={onAbort} className="ui-quiet-button">
      停止
    </button>
  </div>
)
