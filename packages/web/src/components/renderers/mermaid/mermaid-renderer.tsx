import { MermaidDiagram } from '../../mermaid-diagram'
import styles from './mermaid-renderer.module.scss'

// A Mermaid file drawn as its diagram, like a Mermaid block in chat: the source
// stays one click away, and in view when the diagram cannot be drawn.
export const MermaidRenderer = ({ source }: { source: string }) => (
  <div className={styles.renderer}>
    <MermaidDiagram source={source}>
      <pre>
        <code>{source}</code>
      </pre>
    </MermaidDiagram>
  </div>
)
