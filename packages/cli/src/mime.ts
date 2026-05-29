import { extname } from 'node:path'

// Minimal extension → content-type map for CLI attachment uploads. The server
// only echoes this back in the descriptor; Claude reads files by path, so an
// exact MIME isn't load-bearing. Unknown extensions fall back to octet-stream.
const BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.csv': 'text/csv',
}

export const contentTypeForPath = (path: string): string =>
  BY_EXT[extname(path).toLowerCase()] ?? 'application/octet-stream'
