import { openAsBlob } from 'node:fs'
import { stat } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import type { Artifact } from '@baton/shared'
import { defineCommand } from 'citty'
import type { ApiClient } from '../client.ts'
import { contentTypeForPath } from '../mime.ts'
import { toJson } from '../output.ts'
import { clientFor, common, resolveProjectId } from '../util.ts'

const formatArtifact = (artifact: Artifact): string =>
  `${artifact.id}  ${artifact.size} B  ${artifact.filename}  ${artifact.url}`

export const publishArtifact = async (
  client: ApiClient,
  projectId: number,
  inputPath: string,
): Promise<Artifact> => {
  const path = resolve(inputPath)
  const info = await stat(path)
  if (!info.isFile()) throw new Error(`not a file: ${inputPath}`)
  const contentType = contentTypeForPath(path)
  return client.artifacts.publish(projectId, {
    filename: basename(path),
    contentType,
    body: await openAsBlob(path, { type: contentType }),
  })
}

const publishCommand = defineCommand({
  meta: { name: 'publish', description: 'publish a file as a project artifact' },
  args: {
    file: { type: 'positional', required: true, description: 'file to publish' },
    ...common,
  },
  run: async ({ args }) => {
    const artifact = await publishArtifact(clientFor(args), resolveProjectId({}), args.file)
    console.log(
      args.json
        ? toJson(artifact)
        : `${formatArtifact(artifact)}\ndownload: ${artifact.downloadUrl}`,
    )
  },
})

const listCommand = defineCommand({
  meta: { name: 'ls', description: 'list artifacts in the current project' },
  args: common,
  run: async ({ args }) => {
    const artifacts = await clientFor(args).artifacts.listByProject(resolveProjectId({}))
    console.log(
      args.json
        ? toJson(artifacts)
        : artifacts.length
          ? artifacts.map(formatArtifact).join('\n')
          : '(none)',
    )
  },
})

const removeCommand = defineCommand({
  meta: { name: 'rm', description: 'delete a project artifact' },
  args: {
    id: { type: 'positional', required: true, description: 'artifact id' },
    ...common,
  },
  run: async ({ args }) => {
    const id = Number(args.id)
    if (!Number.isInteger(id) || id <= 0) throw new Error('artifact id must be a positive integer')
    const client = clientFor(args)
    const projectId = resolveProjectId({})
    const belongsToProject = (await client.artifacts.listByProject(projectId)).some(
      artifact => artifact.id === id,
    )
    if (!belongsToProject) throw new Error(`artifact ${id} not found in current project`)
    await client.artifacts.remove(id)
    console.log(args.json ? toJson({ ok: true, deleted: id }) : `deleted artifact ${id}`)
  },
})

export const artifact = defineCommand({
  meta: { name: 'artifact', description: 'publish and manage project artifacts' },
  subCommands: { publish: publishCommand, ls: listCommand, rm: removeCommand },
})
