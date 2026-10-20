// Which viewer renders a text file, chosen by its name.
export type FileKind = 'markdown' | 'text'

export const fileKindFor = (path: string): FileKind =>
  /\.(md|markdown)$/i.test(path) ? 'markdown' : 'text'
