import { InfoIcon, WorkerIcon } from '../../../components/icons'
import type { StreamState } from '../use-session-stream'

type ConnectionBannerProps = { streamStatus: StreamState['status']; connected: boolean }

export const ConnectionBanner = ({ streamStatus, connected }: ConnectionBannerProps) => {
  if (streamStatus === 'connecting') return null
  const interrupted = streamStatus !== 'open'
  if (!interrupted && connected) return null
  return (
    <div
      className={`chat-connection-notice ${interrupted ? 'chat-connection-interrupted' : ''}`}
      role="status"
    >
      {interrupted ? <InfoIcon /> : <WorkerIcon />}
      <div>
        <strong>{interrupted ? '实时连接已中断' : '执行环境离线'}</strong>
        <span>
          {interrupted
            ? '正在恢复连接，显示的内容可能暂时不是最新状态。'
            : '历史记录仍可查看，执行需等待环境恢复连接。'}
        </span>
      </div>
    </div>
  )
}
