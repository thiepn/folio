import type { Transaction } from 'dexie'
import type { FocusSessionEntity } from '../domain/models'

export async function migrateV6ToV7(tx: Transaction) {
  await tx.table<FocusSessionEntity, string>('focusSessions').toCollection().modify((session) => {
    session.mode = session.mode ?? 'stopwatch'
    session.durationSeconds = Number.isFinite(session.durationSeconds) ? session.durationSeconds : 0
    if (session.status === 'running' && !session.resumedAt) session.resumedAt = session.updatedAt || session.startedAt
  })
}
