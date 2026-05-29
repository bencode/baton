import { freshStore, type TestStore } from '../test-db.ts'

// Tiny harness for contract tests: every per-domain file calls newCtx() in its
// beforeEach. seedReq plants a workspace → project → requirement so session /
// task / worker tests have a parent to attach to without re-typing the chain.
export type ContractCtx = TestStore

export const newCtx = (): Promise<ContractCtx> => freshStore()

export const seedReq = async (ctx: ContractCtx): Promise<{ req: number; project: number }> => {
  const w = await ctx.store.workspaces.create({ name: 'w' })
  const p = await ctx.store.projects.create({ workspaceId: w.id, name: 'p' })
  const r = await ctx.store.requirements.create({ projectId: p.id, title: 'r' })
  return { req: r.id, project: p.id }
}

// Seed a worker so session tests can pass a valid workerId (Session FK Restrict).
// Fresh DB always hits the 'created' branch — guard exists only to narrow the
// discriminated union return so `.worker.id` is reachable.
export const seedWorker = async (ctx: ContractCtx, projectId: number): Promise<number> => {
  const out = await ctx.store.workers.register({
    projectId,
    machineId: `mid-test-${projectId}`,
    name: 'test-worker',
    hostname: 'h-test',
  })
  if (out.kind === 'name-collision')
    throw new Error('seedWorker: unexpected name-collision on fresh DB')
  return out.worker.id
}
