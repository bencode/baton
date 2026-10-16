export const WorkingIndicator = ({
  statusKnown = true,
  stopping = false,
}: {
  statusKnown?: boolean
  stopping?: boolean
}) => (
  <div className="chat-working-bar" role="status">
    <span
      aria-hidden="true"
      className={statusKnown ? 'chat-working-dot animate-breathe' : 'chat-working-dot'}
    />
    {stopping
      ? '已请求停止，等待执行状态更新…'
      : statusKnown
        ? '正在处理，可以继续输入…'
        : '等待状态同步…'}
  </div>
)
