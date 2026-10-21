// Which viewer renders a text file, chosen by its name: Markdown and HTML can also
// be rendered, Mermaid files are drawn; everything else is read as source.
export type FileKind = 'markdown' | 'html' | 'mermaid' | 'source'

export const fileKindFor = (path: string): FileKind => {
  if (/\.(md|markdown)$/i.test(path)) return 'markdown'
  if (/\.html?$/i.test(path)) return 'html'
  if (/\.(mmd|mermaid)$/i.test(path)) return 'mermaid'
  return 'source'
}
