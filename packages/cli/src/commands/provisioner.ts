import { defineCommand } from 'citty'
import { loadProvisionerConfig } from '../provisioner/config.ts'
import { runProvisioner } from '../provisioner/daemon.ts'
import { installProvisionerAgent } from '../provisioner/launchd.ts'

const configArg = {
  config: {
    type: 'string' as const,
    required: true as const,
    description: 'absolute path to private provisioner JSON config',
  },
}
export const provisioner = defineCommand({
  meta: {
    name: 'provisioner',
    description: 'prepare local repositories and launch workers on macOS',
  },
  subCommands: {
    run: defineCommand({
      args: configArg,
      run: async ({ args }) => {
        const config = await loadProvisionerConfig(args.config)
        const abort = new AbortController()
        const stop = (): void => abort.abort()
        process.on('SIGINT', stop)
        process.on('SIGTERM', stop)
        try {
          await runProvisioner(config, abort.signal)
        } finally {
          process.off('SIGINT', stop)
          process.off('SIGTERM', stop)
        }
      },
    }),
    install: defineCommand({
      args: configArg,
      run: async ({ args }) => {
        const config = await loadProvisionerConfig(args.config)
        await installProvisionerAgent(config, args.config)
        console.log(
          'installed dev.fmap.baton-provisioner; inspect ~/Library/Logs/baton-provisioner.log',
        )
      },
    }),
  },
})
