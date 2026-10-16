import type { Root, RootContent } from 'mdast'
import type { Plugin } from 'unified'

export const markMermaidFences: Plugin<[], Root> = () => (tree, file) => {
  const visit = (node: Root | RootContent, quoteDepth = 0) => {
    if (node.type === 'code' && node.lang?.toLowerCase() === 'mermaid') {
      const start = node.position?.start.offset
      const end = node.position?.end.offset
      const lines =
        start === undefined || end === undefined
          ? []
          : String(file.value).slice(start, end).trimEnd().split('\n')
      const opening = lines[0]?.match(/^\s*(`{3,}|~{3,})/)?.[1]
      const closing = lines.at(-1)?.match(/^[\t ]*((?:>[\t ]*)*)(`+|~+)[\t ]*$/)
      const complete = Boolean(
        lines.length > 1 &&
          opening &&
          closing?.[1] !== undefined &&
          closing[1].split('>').length - 1 === quoteDepth &&
          closing[2] !== undefined &&
          closing[2].length >= opening.length &&
          [...closing[2]].every(char => char === opening[0]),
      )
      node.data = {
        ...node.data,
        hProperties: {
          ...node.data?.hProperties,
          className: ['language-mermaid'],
          'data-mermaid-complete': String(complete),
        },
      }
    }
    if ('children' in node)
      node.children.forEach(child => {
        visit(child, quoteDepth + (node.type === 'blockquote' ? 1 : 0))
      })
  }
  visit(tree)
}
