import { randomUUID } from 'node:crypto'
import type {
  AttemptResult,
  ClaimInput,
  ClaimResult,
  ExecutionState,
  FinishInput,
  SessionEvent,
  StopReason,
  UserMessage,
  UserMessagePayload,
} from '@baton/shared'
import type { Prisma, PrismaClient } from '@prisma/client'
import { TURN_LIVENESS_TTL_MS } from '../../busy.ts'
import { toAttempt, toPendingInput, toSession, toSessionEvent, toTurn } from '../mappers.ts'
import { ExecutionConflict, type Mutation, type Store } from '../types.ts'
import { appendSessionEvent, lockSession } from './session-events.ts'

const openTurn = (tx: Prisma.TransactionClient, sessionId: number) =>
  tx.sessionTurn.findUnique({
    where: { openKey: String(sessionId) },
    include: { attempts: { orderBy: { number: 'desc' }, take: 1 } },
  })

const state = async (tx: Prisma.TransactionClient, sessionId: number): Promise<ExecutionState> => {
  const session = await tx.session.findUniqueOrThrow({ where: { id: sessionId } })
  const turn = await openTurn(tx, sessionId)
  return {
    paused: session.paused,
    contextResetRequested: session.contextResetRequested,
    pendingCount: await tx.sessionPendingInput.count({ where: { sessionId } }),
    turn: turn ? toTurn(turn) : null,
    attempt: turn?.attempts[0] ? toAttempt(turn.attempts[0]) : null,
  }
}

const ownedAttempt = async (
  tx: Prisma.TransactionClient,
  sessionId: number,
  attemptId: number,
  runnerToken: string,
) => {
  const row = await tx.sessionTurnAttempt.findUnique({
    where: { id: attemptId },
    include: { turn: true },
  })
  if (!row || row.turn.sessionId !== sessionId || row.runnerToken !== runnerToken)
    throw new ExecutionConflict('attempt does not belong to this runner')
  return row
}

const requireRunning = (row: { status: string; leaseUntil: Date }): void => {
  if (row.status !== 'running' || row.leaseUntil.getTime() <= Date.now())
    throw new ExecutionConflict('attempt is no longer running')
}

const resetContext = async (tx: Prisma.TransactionClient, sessionId: number) => {
  const session = await tx.session.findUniqueOrThrow({ where: { id: sessionId } })
  if (!session.contextResetRequested) return []
  const id = randomUUID()
  await tx.session.update({
    where: { id: sessionId },
    data: {
      contextResetRequested: false,
      ...(session.agentSessionId
        ? { agentSessionId: session.agentKind === 'codex' ? `pending:${id}` : id }
        : {}),
    },
  })
  return [await appendSessionEvent(tx, sessionId, 'system', { action: 'context_cleared' })]
}

const requestStop = async (
  tx: Prisma.TransactionClient,
  sessionId: number,
  reason: StopReason,
  now: number,
): Promise<SessionEvent[]> => {
  const turn = await openTurn(tx, sessionId)
  const attempt = turn?.attempts[0]
  if (!turn || !attempt) return []
  if (turn.status === 'recovering') {
    if (reason === 'lease_expired') return []
    await tx.sessionTurn.update({
      where: { id: turn.id },
      data: { status: 'aborted', openKey: null, finishedAt: new Date(now) },
    })
    return [await appendSessionEvent(tx, sessionId, 'turn_aborted', { turnId: turn.id, reason })]
  }
  if (
    attempt.status === 'stopping' &&
    (reason === 'lease_expired' || attempt.stopReason !== 'lease_expired')
  )
    return []
  await tx.sessionTurnAttempt.update({
    where: { id: attempt.id },
    data: {
      status: 'stopping',
      stopReason: reason,
      stopRequestedAt: attempt.stopRequestedAt ?? new Date(now),
    },
  })
  return [
    await appendSessionEvent(
      tx,
      sessionId,
      'system',
      {
        action: 'interrupt',
        turnId: turn.id,
        attemptId: attempt.id,
        reason,
      },
      attempt.id,
    ),
  ]
}

const finish = async (
  tx: Prisma.TransactionClient,
  sessionId: number,
  attemptId: number,
  input: FinishInput,
  stopped: boolean,
): Promise<Mutation<AttemptResult>> => {
  await lockSession(tx, sessionId)
  const row = await ownedAttempt(tx, sessionId, attemptId, input.runnerToken)
  if (row.result) {
    const result = JSON.parse(row.result) as AttemptResult
    if (
      !stopped &&
      !row.stopReason &&
      (input.outcome !== result.outcome ||
        (input.message || undefined) !== result.message ||
        (input.subtype || undefined) !== result.subtype)
    )
      throw new ExecutionConflict('conflicting attempt result')
    return { value: result, events: [] }
  }
  if (stopped && row.status !== 'stopping')
    throw new ExecutionConflict('attempt has no stop request')
  if (row.status !== 'stopping') requireRunning(row)
  const reason = row.stopReason
  const retrying = reason === 'lease_expired' && row.number < 4
  const result: AttemptResult = reason
    ? {
        outcome: reason === 'lease_expired' || reason === 'timeout' ? 'failed' : 'aborted',
        message: reason,
        ...(retrying ? { retrying: true } : {}),
      }
    : {
        outcome: input.outcome,
        ...(input.message ? { message: input.message } : {}),
        ...(input.subtype ? { subtype: input.subtype } : {}),
      }
  const now = new Date()
  await tx.sessionTurnAttempt.update({
    where: { id: row.id },
    data: {
      status: result.outcome,
      finishedAt: now,
      result: JSON.stringify(result),
    },
  })
  await tx.sessionTurn.update({
    where: { id: row.turnId },
    data: {
      status: retrying ? 'recovering' : result.outcome,
      openKey: retrying ? String(sessionId) : null,
      finishedAt: retrying ? null : now,
    },
  })
  const type =
    result.outcome === 'completed'
      ? 'turn_complete'
      : result.outcome === 'aborted'
        ? 'turn_aborted'
        : 'turn_error'
  const event = await appendSessionEvent(
    tx,
    sessionId,
    type,
    {
      ...result,
      turnId: row.turnId,
      attemptId: row.id,
      attempt: row.number,
    },
    row.id,
  )
  const cleared = retrying ? [] : await resetContext(tx, sessionId)
  return { value: result, events: [event, ...cleared] }
}

const claim = async (
  tx: Prisma.TransactionClient,
  sessionId: number,
  input: ClaimInput,
): Promise<Mutation<ClaimResult>> => {
  const session = await lockSession(tx, sessionId)
  const previous = await tx.sessionTurnAttempt.findUnique({
    where: { claimId: input.claimId },
    include: { turn: true },
  })
  if (
    previous &&
    (previous.turn.sessionId !== sessionId || previous.runnerToken !== input.runnerToken)
  )
    throw new ExecutionConflict('claim belongs to another runner')
  if (previous?.result)
    return {
      value: {
        kind: 'settled',
        attemptId: previous.id,
        result: JSON.parse(previous.result) as AttemptResult,
      },
      events: [],
    }
  if (previous && (previous.status === 'stopping' || previous.leaseUntil.getTime() <= Date.now()))
    return { value: { kind: 'stopping', attemptId: previous.id }, events: [] }
  if (!session.agentSessionId || !session.worktreePath)
    throw new ExecutionConflict('session is not materialized')
  if (session.paused || session.contextResetRequested)
    return { value: { kind: 'idle' }, events: [] }
  let turn = previous?.turn ?? (await openTurn(tx, sessionId))
  if (!previous && turn && turn.status !== 'recovering')
    return { value: { kind: 'idle' }, events: [] }
  const events: SessionEvent[] = []
  if (!turn) {
    const rows = (
      await tx.sessionPendingInput.findMany({
        where: { sessionId },
        orderBy: { id: 'asc' },
      })
    ).map(toPendingInput)
    const first = rows[0]
    if (!first) return { value: { kind: 'idle' }, events: [] }
    const end = rows.findIndex(
      r => r.planMode !== first.planMode || r.model !== first.model || r.effort !== first.effort,
    )
    const batch = end < 0 ? rows : rows.slice(0, end)
    const payload: UserMessagePayload = {
      text: batch
        .map(r => r.text.trim())
        .filter(Boolean)
        .join('\n\n'),
      images: batch.flatMap(r => r.images),
      attachments: batch.flatMap(r => r.attachments),
      planMode: first.planMode,
      ...(first.model ? { model: first.model } : {}),
      ...(first.effort ? { effort: first.effort } : {}),
      inputIds: batch.map(r => r.id),
      replyInputId: batch.findLast(r => r.replyExpected)?.id,
    }
    const message = await appendSessionEvent(tx, sessionId, 'user_message', payload)
    events.push(message)
    turn = await tx.sessionTurn.create({
      data: {
        sessionId,
        userEventSequence: message.sequence,
        status: 'running',
        openKey: String(sessionId),
      },
    })
    await tx.sessionPendingInput.deleteMany({ where: { sessionId, id: { in: payload.inputIds } } })
    const updated = await tx.session.update({
      where: { id: sessionId },
      data: { queueRevision: { increment: 1 } },
    })
    events.push(
      await appendSessionEvent(tx, sessionId, 'queue_changed', {
        revision: updated.queueRevision,
        consumedIds: payload.inputIds,
      }),
    )
  }
  const count = await tx.sessionTurnAttempt.count({ where: { turnId: turn.id } })
  const attempt =
    previous ??
    (await tx.sessionTurnAttempt.create({
      data: {
        turnId: turn.id,
        number: count + 1,
        claimId: input.claimId,
        runnerToken: input.runnerToken,
        status: 'running',
        leaseUntil: new Date(Date.now() + TURN_LIVENESS_TTL_MS),
      },
    }))
  turn = await tx.sessionTurn.update({ where: { id: turn.id }, data: { status: 'running' } })
  const row = await tx.sessionEvent.findUniqueOrThrow({
    where: { sessionId_sequence: { sessionId, sequence: turn.userEventSequence } },
  })
  const message = toSessionEvent(row) as UserMessage
  if (!previous)
    events.push(
      await appendSessionEvent(
        tx,
        sessionId,
        'turn_start',
        {
          turnId: turn.id,
          attemptId: attempt.id,
          attempt: attempt.number,
          messageId: message.id,
          inputIds: message.payload.inputIds,
        },
        attempt.id,
      ),
    )
  return {
    value: {
      kind: 'execute',
      turn: toTurn(turn),
      attempt: toAttempt(attempt),
      message,
      config: {
        agentKind: toSession(session).agentKind,
        agentSessionId: session.agentSessionId,
        worktreePath: session.worktreePath,
      },
    },
    events,
  }
}

export const prismaSessionTurns = (prisma: PrismaClient): Store['turns'] => ({
  state: sessionId => prisma.$transaction(tx => state(tx, sessionId)),
  claim: (sessionId, input) => prisma.$transaction(tx => claim(tx, sessionId, input)),
  event: (sessionId, attemptId, runnerToken, type, payload) =>
    prisma.$transaction(async tx => {
      await lockSession(tx, sessionId)
      requireRunning(await ownedAttempt(tx, sessionId, attemptId, runnerToken))
      const event = await appendSessionEvent(tx, sessionId, type, payload, attemptId)
      return { value: event, events: [event] }
    }),
  heartbeat: (sessionId, attemptId, runnerToken, stopReason) =>
    prisma.$transaction(async tx => {
      await lockSession(tx, sessionId)
      const row = await ownedAttempt(tx, sessionId, attemptId, runnerToken)
      if (row.status === 'stopping')
        return { abortRequested: true, leaseUntil: row.leaseUntil.getTime() }
      requireRunning(row)
      if (stopReason === 'timeout') {
        await requestStop(tx, sessionId, 'timeout', Date.now())
        return { abortRequested: true, leaseUntil: row.leaseUntil.getTime() }
      }
      const leaseUntil = Date.now() + TURN_LIVENESS_TTL_MS
      await tx.sessionTurnAttempt.update({
        where: { id: row.id },
        data: { leaseUntil: new Date(leaseUntil) },
      })
      return { abortRequested: false, leaseUntil }
    }),
  finish: (sessionId, attemptId, input) =>
    prisma.$transaction(tx => finish(tx, sessionId, attemptId, input, false)),
  stopped: (sessionId, attemptId, runnerToken) =>
    prisma.$transaction(tx =>
      finish(tx, sessionId, attemptId, { runnerToken, outcome: 'aborted' }, true),
    ),
  materialize: (sessionId, attemptId, runnerToken, agentSessionId) =>
    prisma.$transaction(async tx => {
      await lockSession(tx, sessionId)
      requireRunning(await ownedAttempt(tx, sessionId, attemptId, runnerToken))
      await tx.session.update({ where: { id: sessionId }, data: { agentSessionId } })
    }),
  control: (sessionId, action) =>
    prisma.$transaction(async tx => {
      await lockSession(tx, sessionId)
      await tx.session.update({
        where: { id: sessionId },
        data: {
          ...(action === 'resume' ? { paused: false } : {}),
          ...(action === 'session_stop' ? { paused: true } : {}),
          ...(action === 'context_clear' ? { contextResetRequested: true } : {}),
        },
      })
      const events = action === 'resume' ? [] : await requestStop(tx, sessionId, action, Date.now())
      if (!(await openTurn(tx, sessionId))) events.push(...(await resetContext(tx, sessionId)))
      return { value: await state(tx, sessionId), events }
    }),
  expire: (sessionId, now) =>
    prisma.$transaction(async tx => {
      await lockSession(tx, sessionId)
      const turn = await openTurn(tx, sessionId)
      const attempt = turn?.attempts[0]
      const events =
        attempt?.status === 'running' && attempt.leaseUntil.getTime() <= now
          ? await requestStop(tx, sessionId, 'lease_expired', now)
          : []
      return { value: await state(tx, sessionId), events }
    }),
  worklist: async workerId =>
    (
      await prisma.session.findMany({
        where: {
          ...(workerId === undefined ? {} : { workerId }),
          OR: [
            { turns: { some: { openKey: { not: null } } } },
            { paused: false, pendingInputs: { some: {} } },
            { paused: true },
            { contextResetRequested: true },
          ],
        },
      })
    ).map(toSession),
})
