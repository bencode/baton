import type { Id } from '@baton/shared'
import { type ReactNode, useState } from 'react'
import { useApi } from '../../app/api-context'
import { useAsync } from '../../hooks/use-async'
import { copyText } from '../../utils/clipboard'

const CommandBlock = ({ command }: { command: string }) => {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    copyText(command)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="mg-command">
      <code>{command}</code>
      <button type="button" onClick={copy} aria-label="复制命令" className="ui-button shrink-0">
        {copied ? '已复制' : '复制'}
      </button>
    </div>
  )
}

const TokenStep = () => {
  const api = useApi()
  const [attempt, setAttempt] = useState(0)
  const { data: me, loading, error } = useAsync(() => api.auth.me(), attempt)
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [mintError, setMintError] = useState(false)
  const mint = async () => {
    if (busy) return
    setBusy(true)
    setMintError(false)
    try {
      setToken((await api.auth.mintToken()).token)
    } catch {
      setMintError(true)
    } finally {
      setBusy(false)
    }
  }
  if (loading)
    return (
      <p role="status" className="text-xs text-ui-muted">
        加载认证信息…
      </p>
    )
  if (error)
    return (
      <p role="alert" className="text-xs text-ui-danger">
        无法加载认证信息。
        <button type="button" className="underline" onClick={() => setAttempt(value => value + 1)}>
          重试
        </button>
      </p>
    )
  if (me?.authRequired === false && me.user === null)
    return <p className="text-xs text-ui-muted">本地模式无需个人 Token，可直接注册并运行。</p>
  if (!me?.user)
    return (
      <p role="alert" className="text-xs text-ui-danger">
        无法确认登录身份，请重新登录后继续。
      </p>
    )
  if (token)
    return (
      <div className="mg-form">
        <CommandBlock command={`export BATON_TOKEN=${token}`} />
        <p role="status" className="text-xs text-ui-warning">
          Token 仅显示一次，请立即复制保存。
        </p>
      </div>
    )
  return (
    <div className="mg-form">
      {me.hasToken && (
        <p className="text-xs leading-5 text-ui-muted">
          你已有 Token，可使用之前保存的值。重新生成将使旧 Token 失效，请同步更新使用它的
          BATON_TOKEN 配置。
        </p>
      )}
      {mintError && (
        <p role="alert" className="text-xs text-ui-danger">
          无法生成 Token，请稍后重试。
        </p>
      )}
      <button type="button" onClick={() => void mint()} disabled={busy} className="ui-button w-fit">
        {busy ? '生成中…' : me.hasToken ? '重新生成 Token' : '生成 Token'}
      </button>
    </div>
  )
}

const Step = ({ n, title, children }: { n: number; title: string; children: ReactNode }) => (
  <section className="mg-form">
    <h3 className="text-sm font-medium">
      <span className="mr-2 text-ui-muted">{n}.</span>
      {title}
    </h3>
    {children}
  </section>
)

export const RegisterWorkerGuide = ({ projectId }: { projectId: Id }) => {
  const serverUrl = `${window.location.origin}/api`
  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs leading-5 text-ui-muted">
        在目标机器的项目目录中注册并启动执行环境，连接到当前项目。
      </p>
      <Step n={1} title="安装 CLI">
        <CommandBlock command="npm i -g @lesscap/baton-cli" />
      </Step>
      <Step n={2} title="连接认证">
        <TokenStep />
      </Step>
      <Step n={3} title="注册并运行">
        <CommandBlock command={`baton worker register --url ${serverUrl} --project ${projectId}`} />
        <CommandBlock command="baton worker run" />
      </Step>
      <p className="text-xs leading-5 text-ui-muted">
        连接后可在执行环境页查看。默认使用 Claude Code；注册 Codex 环境时可使用 CLI 的{' '}
        <code>--agentKind codex</code> 参数。目标机器需已配置所选 Agent。
      </p>
    </div>
  )
}
