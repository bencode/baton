import type { Id } from './ids.ts'

// A machine that runs a Provisioner. Workspaces are assigned the hosts their
// projects may create Workers on. The token authenticates that Provisioner and
// only ever leaves the server in a HostCredential.
export type Host = {
  id: Id
  name: string
  createdAt: number
}
export type HostCredential = { host: Host; token: string }
export type AdminHost = Host & { online: boolean; workspaceIds: Id[] }
export type HostOption = { id: Id; name: string; online: boolean }
