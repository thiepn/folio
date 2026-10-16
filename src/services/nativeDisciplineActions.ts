import { db } from '../db/database'
import { localDateKey } from '../domain/date'
import { habitService } from './habitService'
import { focusService } from './focusService'
import { executeReviewedDisciplineCommand, type DisciplineCommand, type DisciplineReceipt } from './disciplineCommandGate'

/**
 * Original Folio service authorization, not a remote RPC endpoint.
 * A Folio-native, visible confirmation must approve each command.
 *
 * Both the outer receipt gate and the transaction verify the original record
 * revision. The final state mutation goes through Folio's original services.
 * No new DB schema, journal, account claim or cross-origin write permission.
 */
export async function applyNativeReviewedDisciplineAction(
  input: unknown,
  approve: (command: DisciplineCommand) => Promise<boolean>,
): Promise<DisciplineReceipt | null> {
  return executeReviewedDisciplineCommand(input, {
    approve,
    async readUpdatedAt(command) {
      if (command.operation === 'calendar.review') return null // no false calendar mutation
      if (command.operation === 'focus.finish') {
        const session=await db.focusSessions.get(command.resourceId)
        return session && session.status !== 'cancelled' ? session.updatedAt : null
      }
      const habit=await db.habits.get(command.resourceId)
      if (!habit || habit.archived || habit.pauses.some(p => localDateKey()>=p.startDate && (!p.endDate || localDateKey()<=p.endDate))) return null
      const entry=await db.habitEntries.get(`${habit.id}:${localDateKey()}`)
      return entry?.updatedAt ?? habit.updatedAt
    },
    async originalServiceAction(command) {
      if (command.operation === 'focus.finish') {
        return db.transaction('rw',db.focusSessions,async()=>{
          const session=await db.focusSessions.get(command.resourceId)
          if (!session || session.status === 'cancelled')return 'unavailable'
          if (session.updatedAt!==command.expectedUpdatedAt)return 'conflict'
          if (session.status!=='running' && session.status!=='paused')return 'unavailable'
          await focusService.finish(session.id)
          return 'applied'
        })
      }
      if (command.operation==='calendar.review')return 'unavailable'
      return db.transaction('rw',db.habits,db.habitEntries,async()=>{
        const habit=await db.habits.get(command.resourceId)
        const date=localDateKey()
        if(!habit||habit.archived||
          habit.pauses.some(p=>date>=p.startDate&&(!p.endDate||date<=p.endDate)))return 'unavailable'
        const entry=await db.habitEntries.get(`${habit.id}:${date}`)
        if((entry?.updatedAt??habit.updatedAt)!==command.expectedUpdatedAt)return 'conflict'
        if(command.operation==='habit.complete'){
          if(entry?.status==='completed')return 'applied' // no repeat mutation
          await habitService.setValue(habit.id,date,Math.max(1,habit.target))
          return 'applied'
        }
        if(command.operation==='habit.reopen'){
          if(!entry || entry.status!=='completed')return 'unavailable'
          await habitService.clearEntry(habit.id,date)
          return 'applied'
        }
        return 'unavailable'
      })
    },
  })
}
