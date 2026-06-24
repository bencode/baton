import type { Id } from '@baton/shared'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { useEffect, useRef } from 'react'

// The session's interactive terminal: xterm.js attached over a SAME-ORIGIN
// WebSocket to the server bridge (/api/sessions/:id/terminal/ws), which relays to
// the worker's pty. Output = raw pty bytes (xterm.write); input + resize go up as
// framed JSON ({t:'i',d} / {t:'r',c,r}). No direct worker connection — works for
// remote workers behind NAT, over https. Reconnect-safe (no ttyd --once).
export const TerminalView = ({ sessionId }: { sessionId: Id }) => {
  const hostRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const term = new Terminal({ fontSize: 13, cursorBlink: true, scrollback: 5000 })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    fit.fit()

    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/api/sessions/${sessionId}/terminal/ws`)
    const send = (msg: object) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
    }
    const pushResize = () => {
      fit.fit()
      send({ t: 'r', c: term.cols, r: term.rows }) // claude redraws on resize → fills a fresh viewer
    }
    ws.onopen = () => pushResize()
    ws.onmessage = e => term.write(typeof e.data === 'string' ? e.data : new Uint8Array(e.data))
    const onData = term.onData(d => send({ t: 'i', d }))
    const ro = new ResizeObserver(() => pushResize())
    ro.observe(host)

    return () => {
      onData.dispose()
      ro.disconnect()
      ws.close()
      term.dispose()
    }
  }, [sessionId])

  return <div ref={hostRef} className="min-h-0 w-full flex-1 bg-black p-1" />
}
