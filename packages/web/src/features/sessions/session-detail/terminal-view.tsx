import type { Id } from '@baton/shared'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { useEffect, useRef } from 'react'

// The session's interactive terminal: xterm.js attached over a SAME-ORIGIN
// WebSocket to the server bridge (/api/sessions/:id/terminal/ws), which relays to
// the worker's pty. Output = raw pty bytes (xterm.write); input + resize go up as
// framed JSON ({t:'i',d} / {t:'r',c,r}). No direct worker connection — works for
// remote workers behind NAT, over https. Reconnect-safe (a re-mount reconnects).
export const TerminalView = ({ sessionId }: { sessionId: Id }) => {
  const hostRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const term = new Terminal({ fontSize: 13, cursorBlink: true, scrollback: 5000 })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)

    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/api/sessions/${sessionId}/terminal/ws`)
    // Fit xterm to the container and push the new size to the pty so claude redraws
    // at full width/height. The initial fit MUST run after the flex layout settles
    // (a bare fit() at mount measures a 0-size box — that's the "switch tabs to fix"
    // bug), so we drive it from rAF / ws-open / ResizeObserver / a short backstop.
    const doFit = () => {
      try {
        fit.fit()
      } catch {
        // renderer not ready yet — a later trigger re-fits
      }
      if (ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ t: 'r', c: term.cols, r: term.rows }))
    }
    ws.onopen = () => doFit()
    // The bridge relays pty output as text frames (server coerces to UTF-8), so
    // e.data is always a string; ignore anything else rather than mis-decoding it.
    ws.onmessage = e => {
      if (typeof e.data === 'string') term.write(e.data)
    }
    const onData = term.onData(d => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'i', d }))
    })
    // ONE-TIME initial fits (not per-resize): the container can measure wrong at
    // mount (tab/flex layout not settled) and the ResizeObserver only fires on a
    // *change* — so a wrong-but-stable initial size would stick until a manual tab
    // switch. rAF catches the post-layout frame; the 500ms backstop catches a slow
    // layout / claude's TUI starting. Ongoing resizes are handled by the RO alone.
    const raf = requestAnimationFrame(doFit)
    const backstop = window.setTimeout(doFit, 500)
    const ro = new ResizeObserver(() => doFit())
    ro.observe(host)

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(backstop)
      onData.dispose()
      ro.disconnect()
      ws.close()
      term.dispose()
    }
  }, [sessionId])

  return <div ref={hostRef} className="min-h-0 w-full flex-1 bg-black p-1" />
}
