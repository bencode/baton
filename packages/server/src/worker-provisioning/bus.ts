import type { ProvisionerSignal } from '@baton/shared'
import { createPubSub, type PubSub } from '../pubsub.ts'

export type ProvisionerBus = PubSub<ProvisionerSignal, 'mini'>
export const createProvisionerBus = (): ProvisionerBus => createPubSub('provisioner-bus')
