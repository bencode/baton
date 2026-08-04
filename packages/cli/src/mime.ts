import mime from 'mime'

export const contentTypeForPath = (path: string): string =>
  mime.getType(path) ?? 'application/octet-stream'
