import { defineCommand, runMain } from 'citty'
import { artifact } from './commands/artifact.ts'
import { channel } from './commands/channel.ts'
import { host } from './commands/host.ts'
import { init } from './commands/init.ts'
import { loop } from './commands/loop.ts'
import { notify } from './commands/notify.ts'
import { project } from './commands/project.ts'
import { provisioner } from './commands/provisioner.ts'
import { relay } from './commands/relay.ts'
import { service } from './commands/service.ts'
import { session } from './commands/session.ts'
import { worker } from './commands/worker.ts'
import { workspace } from './commands/workspace.ts'

const main = defineCommand({
  meta: {
    name: 'baton',
    description: 'baton — run a worker daemon; manage projects / sessions',
  },
  // Order matters: high-level verbs first so --help shows them on top.
  subCommands: {
    init,
    worker,
    provisioner,
    host,
    session,
    service,
    artifact,
    loop,
    notify,
    relay,
    channel,
    workspace,
    project,
  },
})

runMain(main)
