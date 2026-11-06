import type { Id, ProvisionerSignal } from '@baton/shared'
import { createPubSub, type PubSub } from '../pubsub.ts'

// Keyed by host id: each host has its own Provisioner stream. A stream is authorized
// once, when it opens, so replacing a token has to end it explicitly.
export type ProvisionerBus = PubSub<ProvisionerSignal> & {
  connection(hostId: Id): AbortSignal
  disconnect(hostId: Id): void
}

export const createProvisionerBus = (): ProvisionerBus => {
  const connections = new Map<Id, AbortController>()
  return {
    ...createPubSub<ProvisionerSignal>('provisioner-bus'),
    connection(hostId) {
      const connection = new AbortController()
      connections.set(hostId, connection)
      return connection.signal
    },
    disconnect(hostId) {
      connections.get(hostId)?.abort()
      connections.delete(hostId)
    },
  }
}
