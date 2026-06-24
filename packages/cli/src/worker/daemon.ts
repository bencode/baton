import { type ChildProcess, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { createConnection } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { query } from '@anthropic-ai/claude-agent-sdk'
import type { Id, WorkerCommand } from '@baton/shared'
import { EventSource } from 'eventsource'
import type { ApiClient } from '../client.ts'
import { defaultWorktreeDir, slug } from '../commands/session/shared.ts'
import {
  PROJECT_CONFIG_NAME,
  saveProjectConfig,
  type WorkerConfig,
  worktreeConfig,
} from '../project-config.ts'
import { generateTitle } from '../session/runner/title.ts'
import { readFirstExchange } from '../session/runner/transcript.ts'
import {
  createWorktree,
  ensureExcluded,
  removeWorktree,
  repoHeadBranch,
  restoreWorktree,
} from '../session/worktree.ts'
import { stale, streamWedged } from './watchdog.ts'

// The persistent, lightweight worker process. It owns no Claude state itself —
// it listens on the server→worker command stream and supervises one child
// process per session (`baton session run <id>`). Children are disposable: if
// one dies the worker just respawns it when the next command arrives. This is
// what makes the worker resilient and sessions cheap.

// Node-runnable entry to re-exec for the session child (`baton session run`).
// Dev: the tsx shim (bin/baton.mjs) that loads src/index.ts. Published bundle:
// no bin/ is shipped, so import.meta.url IS the bundle — re-exec it directly.
const binPath = (): string => {
  const here = dirname(fileURLToPath(import.meta.url))
  const devShim = join(here, '..', '..', 'bin', 'baton.mjs')
  return existsSync(devShim) ? devShim : fileURLToPath(import.meta.url)
}

export const runWorkerDaemon = async (
  cfg: WorkerConfig,
  client: ApiClient,
  signal: AbortSignal,
): Promise<void> => {
  const repo = process.cwd()
  const worktreeDir = defaultWorktreeDir()
  // Track the worktree path alongside the child so we can git-remove it on
  // delete — by then the server row is gone, so we can't re-fetch it.
  const children = new Map<Id, { child: ChildProcess; worktreePath: string }>()
  // Live interactive ttyd terminals (one per session, separate from `children`).
  // Long-lived (unlike the per-turn headless child), so capped by a small port
  // pool — that cap is the backpressure against runaway terminals.
  const terminals = new Map<Id, { proc: ChildProcess; port: number }>()
  const TTYD_PORTS = Array.from({ length: 10 }, (_, i) => 8901 + i)
  const log = (m: string): void => console.log(`[worker #${cfg.workerId} ${cfg.name}] ${m}`)

  // The worker has TWO independent liveness signals, each its own self-watchdog:
  // the heartbeat POST proves the machine is reachable; the command stream (SSE)
  // is how resume/create/stop commands actually arrive. After a server flap
  // either can wedge while the process stays alive — so the supervisor (docker
  // `restart` / launchd KeepAlive) never fires and the worker goes silently
  // offline (commands dropped ⇒ "resume doesn't work"). We judge each by a TIME
  // WINDOW against its last-OK timestamp and, once either is stale, exit non-zero
  // so a clean worker respawns and re-subscribes. Time-windows (not a
  // consecutive-failure count) so a *flapping* server — 502, 200, 502 — can't
  // keep resetting the watchdog and stall forever. The per-ping timeout makes a
  // *hung* server count as silence too (fetch has no timeout of its own).
  const HEARTBEAT_MS = 30_000
  const HEARTBEAT_TIMEOUT_MS = 15_000
  const HEARTBEAT_DEAD_MS = 150_000 // ~5 missed beats with no real recovery
  const STREAM_STALE_MS = 90_000 // stuck not-OPEN this long ⇒ wedged
  const ES_OPEN = 1 // WHATWG EventSource.readyState: 0 CONNECTING, 1 OPEN, 2 CLOSED
  let heartbeatOkAt = Date.now()
  let streamOkAt = Date.now()
  let fatal = false
  let stop: () => void = () => {}

  const trip = (reason: string): void => {
    if (fatal) return
    log(`${reason} — exiting so the supervisor restarts a clean worker`)
    fatal = true
    stop()
  }

  const ping = async (): Promise<void> => {
    try {
      await Promise.race([
        client.workers.heartbeat(cfg.machineId),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('heartbeat timeout')), HEARTBEAT_TIMEOUT_MS),
        ),
      ])
      heartbeatOkAt = Date.now()
    } catch (e) {
      log(`heartbeat failed: ${String(e)}`)
    }
  }

  // Kill the child AND its descendants. The bin shim re-execs tsx, so the child
  // is a small process tree; `detached` makes it a process-group leader and a
  // negative-pid signal tears down the whole group (no orphaned claude/tsx).
  const killChild = (child: ChildProcess): void => {
    if (child.pid === undefined) return
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      // already gone
    }
  }

  // Spawn the session child, handing it the worker credentials via env so it can
  // authenticate session writes with the worker token.
  const spawnChild = (sessionId: Id, worktreePath: string): void => {
    if (children.has(sessionId)) return
    const child = spawn(process.execPath, [binPath(), 'session', 'run', String(sessionId)], {
      detached: true,
      stdio: 'inherit',
      env: {
        ...process.env,
        BATON_SERVER: cfg.server,
        BATON_WORKER_TOKEN: cfg.apiToken,
      },
    })
    children.set(sessionId, { child, worktreePath })
    log(`spawned session #${sessionId} (${worktreePath})`)
    // The child reports itself active once its stream subscription is open (see
    // runner.ts) — so `attached` means "ready to receive", not just "spawned".
    // We only own the inactive report here (on exit), which is the reliable
    // signal even if the child crashes.
    child.on('exit', code => {
      children.delete(sessionId)
      log(`session #${sessionId} child exited (code=${code ?? -1})`)
      // Report inactive; best-effort (404 is fine if the session was deleted).
      void client.sessions.setStatus(sessionId, false, cfg.apiToken).catch(() => {})
    })
  }

  // Poll a TCP port until it accepts (ttyd is listening) or we give up. ttyd
  // cold-start (libwebsockets init) is ~sub-second on modern hardware.
  const waitForPort = (port: number, timeoutMs = 3000): Promise<void> =>
    new Promise((resolve, reject) => {
      const deadline = Date.now() + timeoutMs
      const attempt = (): void => {
        const sock = createConnection({ port, host: '127.0.0.1' })
        sock.once('connect', () => {
          sock.destroy()
          resolve()
        })
        sock.once('error', () => {
          sock.destroy()
          if (Date.now() > deadline) reject(new Error(`port ${port} did not open`))
          else setTimeout(attempt, 100)
        })
      }
      attempt()
    })

  // First port in the pool not already held by a live terminal; null = pool full.
  const freePort = (): number | null => {
    const used = new Set([...terminals.values()].map(t => t.port))
    return TTYD_PORTS.find(p => !used.has(p)) ?? null
  }

  // SAFE DEFAULT: ttyd binds loopback only (http://127.0.0.1) — same-machine dev.
  // ttyd serves an UNAUTHENTICATED interactive claude shell, so we never expose it
  // on the network by default. Setting BATON_TERMINAL_BASE both advertises that
  // host AND opts ttyd into binding all interfaces — only do that behind a trusted
  // network (LAN / tailscale) or the v2 reverse proxy.
  const exposeNetwork = Boolean(process.env.BATON_TERMINAL_BASE)
  const terminalBase = (): string => process.env.BATON_TERMINAL_BASE ?? 'http://127.0.0.1'
  const reportNull = (sessionId: Id): void => {
    void client.sessions
      .reportTerminalUrl(sessionId, null, cfg.apiToken)
      .catch(err => log(`terminal #${sessionId} report-null failed: ${String(err)}`))
  }

  // Open an interactive ttyd terminal serving `claude --resume <agentSessionId>`
  // in the session's worktree — the same conversation the headless relay drives,
  // now hands-on. `--once` makes ttyd accept a single client and exit when it
  // disconnects (the iframe closing / navigating away auto-tears it down and frees
  // the port; no explicit close needed). The spawned URL is reported back so the
  // web can show the iframe. agentSessionId/worktreePath come from the command, so
  // there's NO await before we reserve the slot — a concurrent session.start can't
  // sneak the headless child in (the children.has guard is the backstop).
  const onTerminalOpen = (sessionId: Id, agentSessionId: string, worktreePath: string): void => {
    if (terminals.has(sessionId)) {
      log(`terminal #${sessionId} already open`)
      return
    }
    if (children.has(sessionId)) {
      log(`terminal #${sessionId}: headless child running — refusing`)
      return
    }
    if (!existsSync(worktreePath)) {
      log(`terminal #${sessionId}: worktree missing (${worktreePath}) — refusing`)
      reportNull(sessionId)
      return
    }
    const port = freePort()
    if (port === null) {
      log(`terminal #${sessionId}: port pool full (${TTYD_PORTS.length}) — refusing`)
      reportNull(sessionId)
      return
    }
    const claudeBin = process.env.BATON_CLAUDE_BIN ?? 'claude'
    // bash -c SCRIPT arg0 arg1… → $0=baton $1=worktree $2=agentSessionId $3=claudeBin.
    const script =
      'cd "$1" || exit 1\n' +
      'sf=$(find "$HOME/.claude/projects" -maxdepth 2 -name "$2.jsonl" -print -quit 2>/dev/null)\n' +
      'if [ -n "$sf" ]; then exec "$3" --resume "$2"; else exec "$3" --session-id "$2"; fi'
    const bind = exposeNetwork ? [] : ['-i', '127.0.0.1']
    const proc = spawn(
      'ttyd',
      // biome-ignore format: keep the ttyd argv compact and readable
      ['-p', String(port), ...bind, '-W', '--once', '-t', 'fontSize=14', '--', 'bash', '-c', script,
        'baton', worktreePath, agentSessionId, claudeBin],
      { detached: true, stdio: 'inherit', env: process.env },
    )
    terminals.set(sessionId, { proc, port }) // reserve synchronously — no await gap
    // Either exit (--once after the browser left, explicit close, crash) or a
    // spawn error (ttyd not installed) drops the entry and clears the URL so the
    // UI collapses the iframe.
    const teardown = (why: string): void => {
      if (terminals.get(sessionId)?.proc !== proc) return
      terminals.delete(sessionId)
      log(`terminal #${sessionId} gone (${why})`)
      reportNull(sessionId)
    }
    proc.on('exit', code => teardown(`ttyd exit ${code ?? -1}`))
    proc.on('error', err => teardown(`ttyd spawn error: ${String(err)} — is ttyd installed?`))
    // Wait for ttyd to listen, then report the URL. The slot is already reserved
    // above, so this async tail can't race a concurrent start/open.
    void waitForPort(port)
      .then(() => {
        const url = `${terminalBase()}:${port}`
        log(`terminal #${sessionId} → ${url}`)
        return client.sessions.reportTerminalUrl(sessionId, url, cfg.apiToken)
      })
      .catch(e => {
        log(`terminal #${sessionId} failed to start: ${String(e)}`)
        killChild(proc) // exit handler clears the entry + reports null
      })
  }

  // Explicit teardown (close command / session stop / delete). killChild fires
  // proc.on('exit') → the teardown above removes the entry and reports null.
  const onTerminalClose = (sessionId: Id): void => {
    const t = terminals.get(sessionId)
    if (!t) return
    log(`closing terminal #${sessionId}`)
    killChild(t.proc)
  }

  // Materialize on first sight (mint agentSessionId + git worktree, PATCH them
  // back), then spawn. Idempotent: a session that's already materialized (worker
  // restart) reuses the existing worktree and just respawns.
  const onStart = async (sessionId: Id, name: string): Promise<void> => {
    // An open interactive terminal owns this session's agentSessionId — never let
    // the headless child run alongside it (two claudes, one JSONL → corruption).
    // Defensive backstop: the server already rejects relay messages / resume while
    // a terminal is open, so we mostly won't get here; a start already in flight is
    // dropped. A message queued before the terminal opened drains when the session
    // next starts (the spawned child reconciles its own queue).
    if (terminals.has(sessionId))
      return log(`session #${sessionId} has an open terminal — skipping headless start`)
    if (children.has(sessionId)) return log(`session #${sessionId} already running`)
    const session = await client.sessions.get(sessionId)
    let worktreePath = session.worktreePath
    if (!session.agentSessionId || !worktreePath) {
      const agentSessionId = randomUUID()
      worktreePath = join(worktreeDir, slug(`${name}-${agentSessionId.slice(0, 8)}`))
      createWorktree({
        repo,
        worktreePath,
        sessionCode: agentSessionId.slice(0, 8),
        base: repoHeadBranch(repo),
      })
      await client.sessions.materialize(sessionId, { agentSessionId, worktreePath }, cfg.apiToken)
      log(`materialized session #${sessionId} → ${worktreePath}`)
    } else if (!existsSync(worktreePath)) {
      // Materialized, but the worktree dir is gone (container rebuild / cleanup) —
      // spawning into it would instantly fail. Recreate at the same path, keeping
      // the agentSessionId so the conversation still resumes. No re-PATCH: path and
      // agentSessionId are unchanged.
      restoreWorktree(repo, worktreePath, session.agentSessionId.slice(0, 8))
      log(`recreated session #${sessionId} worktree (was missing) → ${worktreePath}`)
    }
    // Drop the worker's baton context into the worktree so the agent's bare
    // `baton` calls resolve server/project/worker from cwd. Overwrite every
    // start (refreshes a rotated token; no live child yet, so no race), and
    // keep the token-bearing file out of agent commits via info/exclude.
    ensureExcluded(repo, PROJECT_CONFIG_NAME)
    saveProjectConfig(join(worktreePath, PROJECT_CONFIG_NAME), worktreeConfig(cfg))
    spawnChild(sessionId, worktreePath)
  }

  // Stop: kill the child but keep the worktree (session goes inactive, can be
  // resumed). The child's exit handler reports active=false.
  const onStop = (sessionId: Id): void => {
    onTerminalClose(sessionId) // tear down an open terminal too, if any
    const entry = children.get(sessionId)
    if (!entry) return
    killChild(entry.child)
    children.delete(sessionId)
    log(`stopped session #${sessionId}`)
  }

  // Delete: kill the child (if tracked) AND remove the worktree. The path comes
  // from our tracked entry, or from the command itself when we aren't tracking a
  // child for it (e.g. delete after a worker restart).
  const onDelete = (sessionId: Id, worktreePath: string | null): void => {
    onTerminalClose(sessionId) // kill an open terminal before removing the worktree
    const entry = children.get(sessionId)
    if (entry) {
      killChild(entry.child)
      children.delete(sessionId)
    }
    const wt = entry?.worktreePath ?? worktreePath
    if (wt) removeWorktree(repo, wt)
    log(`deleted session #${sessionId} (removed worktree)`)
  }

  // Auto-title (frontend-triggered after the first turn): read the session's own
  // transcript for context, generate a short name with a throwaway claude call,
  // and PATCH it back. The server drops it if the user has locked the name.
  const onTitle = async (
    sessionId: Id,
    agentSessionId: string,
    worktreePath: string,
  ): Promise<void> => {
    const exchange = readFirstExchange(agentSessionId)
    if (!exchange) return log(`title #${sessionId}: no transcript yet, skipping`)
    const outcome = await generateTitle({
      worktreePath,
      userText: exchange.userText,
      assistantText: exchange.assistantText,
      queryFn: query,
    })
    // The claude call itself failed — surface why instead of folding it into
    // the decline message (that masking is how titles silently died once).
    if (outcome.kind === 'error') return log(`title #${sessionId} failed: ${outcome.reason}`)
    // Declined: not enough to title yet — leave the placeholder, retry later.
    if (outcome.kind === 'declined')
      return log(`title #${sessionId}: not enough to title yet, skipping`)
    await client.sessions.setName(sessionId, outcome.title, cfg.apiToken)
    log(`✎ titled session #${sessionId} → ${outcome.title}`)
  }

  // On (re)connect, kill any child whose session no longer exists server-side —
  // heals a session.delete that was dropped while we were disconnected. We do
  // NOT auto-start sessions: resume is explicit.
  const reconcile = async (): Promise<void> => {
    const owned = (await client.sessions.listByProject(cfg.projectId)).filter(
      s => s.workerId === cfg.workerId,
    )
    const live = new Set(owned.map(s => s.id))
    for (const [sid, entry] of children) {
      if (!live.has(sid)) {
        killChild(entry.child)
        children.delete(sid)
        log(`reconcile: stopped orphan session #${sid}`)
      }
    }
  }

  const es = new EventSource(`${cfg.server}/workers/me/stream`, {
    fetch: (url, init) =>
      fetch(url, {
        ...init,
        headers: {
          ...(init?.headers as Record<string, string>),
          authorization: `Bearer ${cfg.apiToken}`,
        },
      }),
  })
  es.onopen = () => {
    streamOkAt = Date.now()
    void reconcile().catch(err => log(`reconcile failed: ${String(err)}`))
  }
  es.onmessage = e => {
    streamOkAt = Date.now()
    try {
      const cmd = JSON.parse(e.data) as WorkerCommand
      if (cmd.cmd === 'session.start')
        void onStart(cmd.sessionId, cmd.name).catch(err => log(`start failed: ${String(err)}`))
      else if (cmd.cmd === 'session.stop') onStop(cmd.sessionId)
      else if (cmd.cmd === 'session.delete') onDelete(cmd.sessionId, cmd.worktreePath)
      else if (cmd.cmd === 'session.title')
        void onTitle(cmd.sessionId, cmd.agentSessionId, cmd.worktreePath).catch(err =>
          log(`title failed: ${String(err)}`),
        )
      else if (cmd.cmd === 'session.terminal') {
        if (cmd.action === 'open')
          onTerminalOpen(cmd.sessionId, cmd.agentSessionId, cmd.worktreePath)
        else onTerminalClose(cmd.sessionId)
      }
    } catch {
      // skip malformed commands
    }
  }
  es.onerror = () => log('command stream error (eventsource will retry)')
  log(`listening for commands (server ${cfg.server}, repo ${repo})`)

  // Single 30s tick: heartbeat, then evaluate both watchdogs. `es` is in scope
  // now, so streamWedged can read its live readyState.
  const watchdog = (): void => {
    const now = Date.now()
    if (stale(heartbeatOkAt, now, HEARTBEAT_DEAD_MS))
      trip(`heartbeat down ~${HEARTBEAT_DEAD_MS / 1000}s`)
    else if (streamWedged(es.readyState === ES_OPEN, streamOkAt, now, STREAM_STALE_MS))
      trip(`command stream wedged ~${STREAM_STALE_MS / 1000}s`)
  }
  void ping()
  const hb = setInterval(() => {
    void ping()
    watchdog()
  }, HEARTBEAT_MS)

  await new Promise<void>(resolve => {
    stop = resolve
    if (signal.aborted) return resolve()
    signal.addEventListener('abort', () => resolve(), { once: true })
  })
  es.close()
  clearInterval(hb)
  for (const { child } of children.values()) killChild(child)
  for (const { proc } of terminals.values()) killChild(proc)
  // Watchdog exit: cleanup ran above, now hand a non-zero code to the supervisor.
  if (fatal) process.exit(1)
}
