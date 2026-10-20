// Which viewer renders a text file, chosen by its name: Markdown can also be
// rendered; everything else is read as source.
export type FileKind = 'markdown' | 'source'

export const fileKindFor = (path: string): FileKind =>
  /\.(md|markdown)$/i.test(path) ? 'markdown' : 'source'
