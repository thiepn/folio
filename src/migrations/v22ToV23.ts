import type { Transaction } from 'dexie'

export async function migrateV22ToV23(tx: Transaction) {
  await tx.table('focusSessions').toCollection().modify((session: any) => {
    session.source = session.source ?? 'timer'
    session.tags = Array.isArray(session.tags) ? session.tags : []
    session.interruptionCount = Number.isFinite(session.interruptionCount) ? session.interruptionCount : 0
    session.breakSeconds = Number.isFinite(session.breakSeconds) ? session.breakSeconds : 0
    session.phaseElapsedSeconds = Number.isFinite(session.phaseElapsedSeconds) ? session.phaseElapsedSeconds : 0
    if (session.mode !== 'pomodoro') {
      session.phase = session.phase ?? undefined
      session.cycle = session.cycle ?? undefined
      session.cycleIndex = session.cycleIndex ?? undefined
    }
  })
}
