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
        正在检查连接凭证…
      </p>
    )
  if (error)
    return (
      <p role="alert" className="text-xs text-ui-danger">
        暂时无法检查连接凭证，请重试。
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
        无法确认当前登录账号，请重新登录后继续。
      </p>
    )
  if (token)
    return (
      <div className="mg-form">
        <CommandBlock command={`export BATON_TOKEN=${token}`} />
        <p role="status" className="text-xs text-ui-warning">
          请复制并保存此 Token，关闭后将无法再次查看。
        </p>
      </div>
    )
  return (
    <div className="mg-form">
      {me.hasToken && (
        <p className="text-xs leading-5 text-ui-muted">
          可以继续使用已保存的 Token。重新生成会使旧 Token 失效，使用它的机器都需要更新
          BATON_TOKEN。
        </p>
      )}
      {mintError && (
        <p role="alert" className="text-xs text-ui-danger">
          Token 生成失败，请稍后重试。
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
        让当前项目使用你自己的电脑或服务器运行 Agent。连接后，即可在 Baton
        中发送任务、查看执行结果。
      </p>
      <Step n={1} title="安装 Baton CLI">
        <p className="text-xs leading-5 text-ui-muted">在目标机器的终端中执行：</p>
        <CommandBlock command="npm i -g @lesscap/baton-cli" />
      </Step>
      <Step n={2} title="配置连接凭证">
        <p className="text-xs leading-5 text-ui-muted">
          连接需要认证时，请在同一终端中设置个人 Token（<code>BATON_TOKEN</code>）。
        </p>
        <TokenStep />
      </Step>
      <Step n={3} title="连接当前项目并启动">
        <p className="text-xs leading-5 text-ui-muted">进入这台机器上的项目目录，依次执行：</p>
        <p className="text-xs leading-5 text-ui-muted">
          默认使用 Claude Code。使用 Codex 或 Pi 时，请在第一条命令末尾添加{' '}
          <code>--agentKind codex</code> 或 <code>--agentKind pi</code>，并提前完成所选 Agent
          的模型与认证配置。
        </p>
        <CommandBlock command={`baton worker register --url ${serverUrl} --project ${projectId}`} />
        <CommandBlock command="baton worker run" />
      </Step>
      <p className="text-xs leading-5 text-ui-muted">
        保持 baton worker run 运行，连接成功后即可在执行环境列表中开始会话。
      </p>
    </div>
  )
}
