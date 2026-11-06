import type { AdminHost, Id } from '@baton/shared'
import { defineCommand } from 'citty'
import type { ApiClient } from '../client.ts'
import { fmtHost, fmtHostCredential, renderList, renderOne } from '../output.ts'
import { clientFor, common } from '../util.ts'

// Accepts a host by name or id; names are what people remember.
export const findHost = <T extends { id: Id; name: string }>(hosts: T[], handle: string): T => {
  const host = hosts.find(item => item.name === handle || String(item.id) === handle)
  if (!host) throw new Error(`host not found: ${handle}`)
  return host
}

const adminHost = async (c: ApiClient, handle: string): Promise<AdminHost> =>
  findHost(await c.hosts.list(), handle)

const positiveId = (raw: string): Id => {
  const id = Number(raw)
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('workspace must be a positive id')
  return id
}

const hostArg = {
  host: { type: 'positional' as const, required: true as const, description: 'host name or id' },
}
const workspaceArg = {
  workspace: { type: 'string' as const, required: true as const, description: 'workspace id' },
}

export const host = defineCommand({
  meta: { name: 'host', description: 'manage machines and which workspaces can use them (admin)' },
  subCommands: {
    add: defineCommand({
      meta: { name: 'add', description: 'add a host; prints its Provisioner token once' },
      args: {
        name: { type: 'positional', required: true, description: 'host name' },
        workspace: { type: 'string', description: 'also assign it to this workspace id' },
        ...common,
      },
      run: async ({ args }) => {
        const c = clientFor(args)
        const workspaceId = args.workspace === undefined ? null : positiveId(args.workspace)
        const credential = await c.hosts.create(args.name)
        // Printed first: the token is shown only once, even if the assignment fails.
        console.log(renderOne(credential, fmtHostCredential, Boolean(args.json)))
        if (workspaceId !== null) await c.hosts.assign(credential.host.id, workspaceId)
      },
    }),
    ls: defineCommand({
      meta: {
        name: 'ls',
        description: 'list hosts, whether they are online, and their workspaces',
      },
      args: { ...common },
      run: async ({ args }) => {
        console.log(renderList(await clientFor(args).hosts.list(), fmtHost, Boolean(args.json)))
      },
    }),
    assign: defineCommand({
      meta: { name: 'assign', description: 'let a workspace create Workers on this host' },
      args: { ...hostArg, ...workspaceArg, ...common },
      run: async ({ args }) => {
        const c = clientFor(args)
        const { id, name } = await adminHost(c, args.host)
        await c.hosts.assign(id, positiveId(args.workspace))
        console.log(`assigned ${name} to workspace ${args.workspace}`)
      },
    }),
    unassign: defineCommand({
      meta: {
        name: 'unassign',
        description: 'stop new Workers on this host for a workspace; existing ones keep running',
      },
      args: { ...hostArg, ...workspaceArg, ...common },
      run: async ({ args }) => {
        const c = clientFor(args)
        const { id, name } = await adminHost(c, args.host)
        await c.hosts.unassign(id, positiveId(args.workspace))
        console.log(`unassigned ${name} from workspace ${args.workspace}`)
      },
    }),
    rotate: defineCommand({
      meta: { name: 'rotate', description: 'replace a host token; the old one stops working' },
      args: { ...hostArg, ...common },
      run: async ({ args }) => {
        const c = clientFor(args)
        const { id } = await adminHost(c, args.host)
        console.log(renderOne(await c.hosts.rotate(id), fmtHostCredential, Boolean(args.json)))
      },
    }),
  },
})
