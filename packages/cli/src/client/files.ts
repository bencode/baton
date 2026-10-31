import type { FileQueryResult, FileReply } from '@baton/shared'
import { rawRequest, request } from './request.ts'

export type FilesClient = {
  report(result: FileQueryResult): Promise<{ ok: true }>
  // Streams a download's bytes; resolves once the server has forwarded all of them.
  uploadDownload(
    requestId: string,
    size: number,
    body: ReadableStream<Uint8Array>,
    signal?: AbortSignal,
  ): Promise<{ ok: true }>
  // Why a download could not be opened.
  rejectDownload(
    requestId: string,
    failure: Extract<FileReply, { ok: false }>,
  ): Promise<{ ok: true }>
}

export const filesClient = (baseUrl: string): FilesClient => {
  const downloadUrl = (requestId: string) =>
    `${baseUrl}/workers/me/files/downloads/${encodeURIComponent(requestId)}`
  return {
    report: result =>
      request(`${baseUrl}/workers/me/files/results`, { method: 'PUT', body: result }),
    uploadDownload: (requestId, size, body, signal) =>
      rawRequest(downloadUrl(requestId), {
        method: 'PUT',
        body,
        headers: { 'content-type': 'application/octet-stream', 'content-length': String(size) },
        ...(signal ? { signal } : {}),
      }),
    rejectDownload: (requestId, failure) =>
      request(downloadUrl(requestId), { method: 'PUT', body: failure }),
  }
}
