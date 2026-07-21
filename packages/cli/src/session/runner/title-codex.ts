import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Codex } from '@openai/codex-sdk'
import { buildTitlePrompt, TITLE_TIMEOUT_MS, titleOutcome, type TitleOutcome } from './title.ts'

type CodexTitleClient = {
  startThread(options: {
    workingDirectory: string
    skipGitRepoCheck: true
    sandboxMode: 'read-only'
    approvalPolicy: 'never'
    networkAccessEnabled: false
    webSearchMode: 'disabled'
  }): {
    run(input: string, options: { signal: AbortSignal }): Promise<{ finalResponse: string }>
  }
}

// A title does not need repository context. Running in an empty temporary cwd
// keeps project instructions and tools out of this one-shot summarization call;
// the SDK still inherits the worker's normal Codex authentication.
export const generateTitleWithCodex = async (input: {
  userText: string
  assistantText: string
  client?: CodexTitleClient
}): Promise<TitleOutcome> => {
  const { userText, assistantText } = input
  if (`${userText}${assistantText}`.trim().length < 4) return { kind: 'declined' }

  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), TITLE_TIMEOUT_MS)
  let cwd = ''
  try {
    cwd = await mkdtemp(join(tmpdir(), 'baton-title-'))
    const client = input.client ?? new Codex()
    const thread = client.startThread({
      workingDirectory: cwd,
      skipGitRepoCheck: true,
      sandboxMode: 'read-only',
      approvalPolicy: 'never',
      networkAccessEnabled: false,
      webSearchMode: 'disabled',
    })
    const result = await thread.run(buildTitlePrompt(userText, assistantText), {
      signal: abort.signal,
    })
    return titleOutcome(result.finalResponse)
  } catch (error) {
    return {
      kind: 'error',
      reason: abort.signal.aborted
        ? `timeout after ${TITLE_TIMEOUT_MS / 1000}s`
        : String(error).slice(0, 300),
    }
  } finally {
    clearTimeout(timer)
    if (cwd) await rm(cwd, { recursive: true, force: true }).catch(() => {})
  }
}
