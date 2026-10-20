import { normalizeFilePath } from '@baton/shared'

// How a link inside a rendered document behaves:
//   anchor   — '#…', stays on the page
//   external — http(s), opens in a new browser tab
//   file     — a repository path, opened in the same worker and branch
//   inert    — anything else (other schemes, paths leaving the repository): plain text
export type LinkTarget =
  | { kind: 'anchor' }
  | { kind: 'external' }
  | { kind: 'file'; path: string }
  | { kind: 'inert' }

const hasScheme = (href: string): boolean => /^[a-z][a-z\d+.-]*:/i.test(href)

const decode = (value: string): string | null => {
  try {
    return decodeURIComponent(value)
  } catch (error) {
    if (error instanceof URIError) return null
    throw error
  }
}

// Resolves `href` against the directory of `currentPath` ('/' starts at the
// repository root). Query and fragment are dropped. Null when the result would
// leave the repository or is not a valid repository path.
export const resolveRelativePath = (currentPath: string, href: string): string | null => {
  if (hasScheme(href) || href.startsWith('//')) return null
  const target = decode(href.split(/[?#]/, 1)[0] ?? '')
  if (!target) return null
  const base = target.startsWith('/') ? [] : currentPath.split('/').slice(0, -1)
  const segments: string[] = []
  for (const segment of [...base, ...target.split('/')]) {
    if (segment === '' || segment === '.') continue
    if (segment !== '..') segments.push(segment)
    else if (segments.pop() === undefined) return null
  }
  return normalizeFilePath(segments.join('/'))
}

export const classifyLink = (currentPath: string, href: string): LinkTarget => {
  if (href.startsWith('#')) return { kind: 'anchor' }
  if (/^https?:\/\//i.test(href)) return { kind: 'external' }
  const path = resolveRelativePath(currentPath, href)
  return path === null ? { kind: 'inert' } : { kind: 'file', path }
}
