import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildTitlePrompt, TITLE_TIMEOUT_MS, type TitleOutcome, titleOutcome } from './title.ts'

// Same shape as the codex titler: an empty temporary cwd, no tools, no skills or
// context files, and a minimal system prompt (an agent-sized system prompt makes
// models answer NONE). Model and credentials are pi's defaults on this worker.
export const generateTitleWithPi = async (input: {
  userText: string
  assistantText: string
}): Promise<TitleOutcome> => {
  const { userText, assistantText } = input
  if (`${userText}${assistantText}`.trim().length < 4) return { kind: 'declined' }

  let cwd = ''
  let timedOut = false
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    cwd = await mkdtemp(join(tmpdir(), 'baton-title-'))
    const pi = await import('@earendil-works/pi-coding-agent')
    const agentDir = pi.getAgentDir()
    const resourceLoader = new pi.DefaultResourceLoader({
      cwd,
      agentDir,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      systemPrompt: 'You title chat sessions.',
    })
    await resourceLoader.reload()
    const { session } = await pi.createAgentSession({
      cwd,
      agentDir,
      resourceLoader,
      sessionManager: pi.SessionManager.inMemory(cwd),
      noTools: 'all',
    })
    let error: string | undefined
    session.subscribe(event => {
      if (event.type === 'message_end' && event.message.role === 'assistant')
        error = event.message.stopReason === 'error' ? event.message.errorMessage : undefined
    })
    timer = setTimeout(() => {
      timedOut = true
      void session.abort().catch(e => console.error(`[title] pi abort: ${String(e)}`))
    }, TITLE_TIMEOUT_MS)
    try {
      await session.prompt(buildTitlePrompt(userText, assistantText))
      if (timedOut) return { kind: 'error', reason: `timeout after ${TITLE_TIMEOUT_MS / 1000}s` }
      if (error) return { kind: 'error', reason: error.slice(0, 300) }
      return titleOutcome(session.getLastAssistantText() ?? '')
    } finally {
      session.dispose()
    }
  } catch (error) {
    return { kind: 'error', reason: String(error).slice(0, 300) }
  } finally {
    clearTimeout(timer)
    if (cwd)
      await rm(cwd, { recursive: true, force: true }).catch(e =>
        console.error(`[title] cleanup ${cwd}: ${String(e)}`),
      )
  }
}
