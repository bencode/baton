import type { Artifact, Id } from '@baton/shared'
import { rawRequest, request } from './request.ts'

export type ArtifactsClient = {
  publish(
    projectId: Id,
    input: { filename: string; contentType: string; body: Blob },
  ): Promise<Artifact>
  listByProject(projectId: Id): Promise<Artifact[]>
  remove(id: Id): Promise<void>
}

export const artifactsClient = (baseUrl: string): ArtifactsClient => {
  const url = (path: string): string => `${baseUrl}${path}`
  return {
    publish: (projectId, input) =>
      rawRequest(
        url(`/artifacts?projectId=${projectId}&filename=${encodeURIComponent(input.filename)}`),
        {
          method: 'POST',
          body: input.body,
          headers: {
            'content-type': input.contentType,
            'content-length': String(input.body.size),
          },
        },
      ),
    listByProject: projectId =>
      request(url(`/artifacts?projectId=${projectId}`), { method: 'GET' }),
    remove: id => request(url(`/artifacts/${id}`), { method: 'DELETE' }),
  }
}
