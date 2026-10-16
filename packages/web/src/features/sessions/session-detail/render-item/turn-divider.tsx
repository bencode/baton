import { CheckIcon, InfoIcon } from '../../../../components/icons'
import type { RateLimitInfo, RenderItem } from '../../event-render'

type TurnItem = Extract<RenderItem, { kind: 'turn-end' | 'turn-error' }>

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms} 毫秒`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} 秒`
  return `${Math.floor(ms / 60_000)} 分 ${Math.floor((ms % 60_000) / 1000)} 秒`
}

const limitTypes: Record<string, string> = {
  one_hour: '1 小时',
  five_hour: '5 小时',
  daily: '24 小时',
}
const limitStatuses: Record<string, string> = {
  allowed: '允许',
  rejected: '已拒绝',
  denied: '已拒绝',
}

const RateLimitNotice = ({ info }: { info?: RateLimitInfo }) => {
  if (
    !info ||
    (info.rateLimitType === undefined && info.status === undefined && info.resetsAt === undefined)
  )
    return null
  const bad = info.status === 'rejected' || info.status === 'denied'
  return (
    <div className={bad ? 'chat-rate-notice' : 'chat-rate-info'}>
      <span>{bad ? '请求受到限流' : '额度信息'}</span>
      {info.rateLimitType && <span>{limitTypes[info.rateLimitType] ?? info.rateLimitType}</span>}
      {info.status && <span>{limitStatuses[info.status] ?? info.status}</span>}
      {info.resetsAt !== undefined ? (
        <span>
          重置时间：
          <time dateTime={new Date(info.resetsAt * 1000).toISOString()}>
            {new Date(info.resetsAt * 1000).toLocaleString('zh-CN')}
          </time>
        </span>
      ) : bad ? (
        <span>未提供恢复时间，可稍后再发起操作。</span>
      ) : null}
    </div>
  )
}

export const TurnDivider = ({ item }: { item: TurnItem }) => {
  if (item.kind === 'turn-error') {
    return (
      <div className={item.finalFailure ? 'chat-turn-failure' : 'chat-execution-notice'}>
        {item.finalFailure && (
          <div className="chat-notice-heading">
            <InfoIcon />
            本轮未完成
          </div>
        )}
        <details>
          <summary className="ui-focus">
            <span>{item.message || '执行提示：未提供错误说明'}</span>
          </summary>
          <div className="chat-error-details">
            <div>第 {item.turnIndex} 轮 · 完整错误信息</div>
            {/* biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable raw output needs a keyboard entry point. */}
            <pre tabIndex={0}>{item.message}</pre>
          </div>
        </details>
        <RateLimitNotice info={item.rateLimit} />
      </div>
    )
  }
  const result = item.result
  const abnormal = result?.subtype && result.subtype !== 'success'
  return (
    <section className="chat-turn-info" aria-label={`第 ${item.turnIndex} 轮结束`}>
      <div className="chat-turn-metadata">
        {result?.subtype === 'success' && <CheckIcon />}
        <span>本轮结束</span>
        {result?.durationMs !== undefined && <span>{formatDuration(result.durationMs)}</span>}
        {result?.totalCostUsd !== undefined && <span>${result.totalCostUsd.toFixed(4)}</span>}
        {abnormal && <span className="chat-status-error">结束原因：{result.subtype}</span>}
      </div>
      <RateLimitNotice info={item.rateLimit} />
    </section>
  )
}
