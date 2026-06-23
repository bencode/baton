import type { Attachment, Session, SessionEvent } from '@baton/shared'
import type { CommandBus } from './command-bus.ts'
import type { EventBus } from './event-bus.ts'
import type { ProjectBus } from './project-bus.ts'
import type { SessionRuntime } from './session-runtime.ts'
import type { Store } from './store/types.ts'

export type DeliverDeps = {
  store: Store
  bus: EventBus
  commands: CommandBus
  runtime: SessionRuntime
  projects: ProjectBus
}

export type DeliverInput = { text: string; images?: string[]; attachments?: Attachment[] }

// Persist a user_message and wake the session's worker — the shared core behind
// both the interactive send (POST /sessions/:id/messages) and the Loop scheduler.
// An active session's child receives it live; an idle session whose worker is
// connected is auto-resumed (publish session.start → the runner spawns and
// reconciles this message from the durable transcript). Returns delivered:false
// when the worker is offline — NOTHING is persisted then, and the caller decides
// what that means (409 for an interactive send, skip for the scheduler).
export const deliverMessage = async (
  session: Session,
  input: DeliverInput,
  deps: DeliverDeps,
): Promise<{ delivered: boolean; event?: SessionEvent }> => {
  const { store, bus, commands, runtime, projects } = deps
  const active = runtime.isActive(session.id)
  if (!active && !commands.has(session.workerId)) return { delivered: false }
  const images = input.images ?? []
  const attachments = input.attachments ?? []
  const payload = {
    text: input.text,
    ...(images.length > 0 ? { images } : {}),
    ...(attachments.length > 0 ? { attachments } : {}),
    // Stamp the turn with the session's plan mode + model override so a resumed
    // (or scheduled) turn honours the same settings an interactive one would.
    ...(session.planMode ? { planMode: true } : {}),
    ...(session.model ? { model: session.model } : {}),
  }
  const ev = await store.sessions.appendEvent(session.id, 'user_message', payload)
  await store.sessions.touch(session.id).catch(() => {})
  projects.publish(session.projectId, { resource: 'sessions' })
  bus.publish(session.id, ev)
  if (!active)
    commands.publish(session.workerId, {
      cmd: 'session.start',
      sessionId: session.id,
      name: session.name,
    })
  return { delivered: true, event: ev }
}
