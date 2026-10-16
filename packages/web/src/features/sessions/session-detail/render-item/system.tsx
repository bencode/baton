import { InfoIcon } from '../../../../components/icons'

export const SystemNotice = ({ text }: { text: string }) => (
  <div className="chat-system-notice">
    <InfoIcon />
    <span>{text}</span>
  </div>
)

export const RawBlock = ({ payload }: { payload: unknown }) => (
  <details className="chat-raw-event">
    <summary className="ui-focus">未识别的事件 · 查看原始数据</summary>
    {/* biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable raw output needs a keyboard entry point. */}
    <pre tabIndex={0}>{JSON.stringify(payload, null, 2) ?? String(payload)}</pre>
  </details>
)
