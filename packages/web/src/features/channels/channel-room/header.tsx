import type { ChannelManifest, ChannelMember } from '@baton/shared'
import { StatusDot } from '../../../components/status-dot'
import type { ChannelStreamState } from '../use-channel-stream'

// Connection state → the header dot. open=live (green), error=offline, else busy.
const dot = (s: ChannelStreamState['status']): 'idle' | 'offline' | 'busy' =>
  s === 'open' ? 'idle' : s === 'error' ? 'offline' : 'busy'

export const ChannelHeader = ({
  manifest,
  members,
  me,
  status,
  onRename,
}: {
  manifest: ChannelManifest
  members: ChannelMember[]
  me: string
  status: ChannelStreamState['status']
  onRename: () => void
}) => (
  <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-gray-200 px-4 py-2">
    <StatusDot status={dot(status)} />
    <span className="min-w-0 max-w-[40%] truncate font-mono text-[13px] font-semibold tracking-tight">
      {manifest.title || '聊天室'}
    </span>
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
      {members.map(m => (
        <span
          key={m.name}
          title={m.kind}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
            m.name === me ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${m.kind === 'agent' ? 'bg-violet-500' : 'bg-emerald-500'}`}
          />
          {m.name}
        </span>
      ))}
    </div>
    <button
      type="button"
      onClick={onRename}
      className="shrink-0 text-xs text-gray-400 hover:text-gray-700"
    >
      我是 {me}（改名）
    </button>
  </header>
)
