import type { Id } from '@baton/shared'
import { type ReactNode, useState } from 'react'
import { useApi } from '../../app/api-context'
import { Modal } from '../../components/modal'
import { useAsync } from '../../hooks/use-async'
import { copyText } from '../../utils/clipboard'

// A copy-able command line + a copy button. Reused for install / register / run.
const CommandBlock = ({ command }: { command: string }) => {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    copyText(command)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="flex items-stretch gap-1.5">
      <code className="flex-1 overflow-x-auto rounded-md bg-gray-50 px-2 py-1.5 text-[11px] whitespace-pre text-gray-700">
        {command}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label="copy command"
        className="shrink-0 rounded-md border border-gray-300 px-2 text-xs text-gray-500 transition-colors hover:bg-gray-50"
      >
        {copied ? '✓' : 'copy'}
      </button>
    </div>
  )
}

// Mint the personal token (BATON_TOKEN) the worker registers with — shown once.
// Moved here from account settings: generating a token only makes sense when you're
// setting up a worker. Regenerating rotates it, so warn if one already exists.
const TokenStep = () => {
  const api = useApi()
  const { data: me } = useAsync(() => api.auth.me(), 'add-worker-me')
  const has = me?.hasToken ?? false
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const mint = async () => {
    if (busy) return
    setBusy(true)
    try {
      setToken((await api.auth.mintToken()).token)
    } catch (err) {
      console.error('[add-worker] mint token failed', err)
    } finally {
      setBusy(false)
    }
  }
  if (token)
    return (
      <div className="flex flex-col gap-1.5">
        <CommandBlock command={`export BATON_TOKEN=${token}`} />
        <span className="text-xs text-amber-600">Shown once — copy it now.</span>
      </div>
    )
  return (
    <div className="flex flex-col gap-1.5">
      {has && (
        <p className="text-xs text-gray-400">
          You already have a token — use the one you saved. Regenerating invalidates it (you'd
          re-set BATON_TOKEN everywhere it's used).
        </p>
      )}
      <button
        type="button"
        onClick={() => void mint()}
        disabled={busy}
        className="w-fit rounded-md bg-gray-900 px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:opacity-40"
      >
        {has ? 'Regenerate token' : 'Generate token'}
      </button>
    </div>
  )
}

const Step = ({ n, title, children }: { n: number; title: string; children: ReactNode }) => (
  <div className="flex flex-col gap-1.5">
    <h3 className="text-sm font-medium text-gray-900">
      <span className="text-gray-400">{n}.</span> {title}
    </h3>
    {children}
  </div>
)

type AddWorkerProps = { projectId: Id; onClose: () => void }

// Guided worker onboarding: a worker is a daemon on some machine, so this can't be
// a pure web "create" — it hands you the exact copy-paste commands (pre-filled with
// this project + this server) to install + register + run one.
export const AddWorker = ({ projectId, onClose }: AddWorkerProps) => {
  const serverUrl = `${window.location.origin}/api`
  return (
    <Modal title="Add a worker" onClose={onClose} className="max-w-lg">
      <div className="flex flex-col gap-4">
        <p className="text-xs text-gray-500">
          A worker is a machine that runs your agents. Set one up on any machine (your laptop, a
          server) — it connects back to this project.
        </p>
        <Step n={1} title="Install the CLI">
          <CommandBlock command="npm i -g @lesscap/baton-cli" />
        </Step>
        <Step n={2} title="Generate your token">
          <TokenStep />
        </Step>
        <Step n={3} title="Register and run">
          <CommandBlock
            command={`baton worker register --url ${serverUrl} --project ${projectId}`}
          />
          <CommandBlock command="baton worker run" />
        </Step>
        <p className="text-xs text-gray-400">
          The worker appears on the left once it connects. The machine needs Claude available
          (claude-code logged in, or ANTHROPIC_API_KEY set).
        </p>
      </div>
    </Modal>
  )
}
