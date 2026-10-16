import mermaid from 'mermaid'
import { type ReactNode, useEffect, useState } from 'react'

mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  htmlLabels: false,
  suppressErrorRendering: true,
  theme: 'neutral',
  layout: 'dagre',
  fontFamily: 'system-ui, sans-serif',
})

type MermaidDiagramProps = { source: string; children: ReactNode }
type DiagramResult =
  | { source: string; status: 'ready'; svg: string; width?: number }
  | { source: string; status: 'error' }

export const MermaidDiagram = ({ source, children }: MermaidDiagramProps) => {
  const [result, setResult] = useState<DiagramResult | null>(null)
  useEffect(() => {
    let cancelled = false
    const container = document.createElement('div')
    container.style.cssText = 'position:fixed;left:-10000px;top:0;visibility:hidden;'
    const draw = async () => {
      try {
        document.body.append(container)
        const { svg } = await mermaid.render(
          `baton-mermaid-${crypto.randomUUID()}`,
          source,
          container,
        )
        if (cancelled) return
        const element = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement
        const width = Number(element.getAttribute('viewBox')?.split(/[\s,]+/)[2])
        setResult({
          source,
          status: 'ready',
          svg,
          width: Number.isFinite(width) && width > 0 ? width : undefined,
        })
      } catch (error) {
        console.warn('[mermaid] diagram rendering failed', error)
        if (!cancelled) setResult({ source, status: 'error' })
      } finally {
        container.remove()
      }
    }
    void draw()
    return () => {
      cancelled = true
    }
  }, [source])

  const current = result?.source === source ? result : null
  return (
    <figure className="chat-mermaid">
      {current?.status === 'ready' ? (
        <>
          <section
            className="chat-mermaid-canvas"
            aria-label="图表，可横向滚动"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: large diagrams scroll horizontally by keyboard.
            tabIndex={0}
          >
            <img
              alt="Mermaid 图表"
              src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(current.svg)}`}
              width={current.width}
            />
          </section>
          <details className="chat-mermaid-source">
            <summary>查看源码</summary>
            {children}
          </details>
        </>
      ) : (
        <>
          <p
            className="chat-mermaid-status"
            role={current?.status === 'error' ? 'alert' : 'status'}
          >
            {current?.status === 'error' ? '图表未能渲染，已保留源码' : '正在生成图表…'}
          </p>
          {children}
        </>
      )}
    </figure>
  )
}
