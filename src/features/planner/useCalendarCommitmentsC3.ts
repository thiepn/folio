/** Calendar C3 is a read-only projection over the original habits,
 * habitEntries and recurring task occurrences. Flexible habit quotas are
 * never assigned artificial due dates or awarded completions. */
import { useLiveQuery } from 'dexie-react-hooks'
import { addLocalDays, localDateKey, localDateRange } from '../../domain/date'
import { habitPausedForDate, habitPeriodProgress, habitScheduledForDate } from '../../domain/habit'
import type { LocalDate, TaskEntity } from '../../domain/models'
import { habitRepository } from '../../repositories/habitRepository'
import { recurrenceRepository } from '../../repositories/recurrenceRepository'

export function useCalendarCommitmentsC3(from:LocalDate, tasks:TaskEntity[]){
 const stored=useLiveQuery(async()=>Promise.all([
  habitRepository.listActive(),
  habitRepository.listAllEntries(),
  recurrenceRepository.listAll(),
 ]),[from])
 if(!stored)return undefined
 const [habits,entries,series]=stored
 const days=localDateRange(from,7)
 const byHabit=new Map(habits.map(h=>[h.id,entries.filter(e=>e.habitId===h.id)]))
 const fixed=habits.filter(h=>!['times-per-week','times-per-month'].includes(h.schedule.type))
 const flexible=habits.filter(h=>h.schedule.type==='times-per-week'||h.schedule.type==='times-per-month')
 const currentSeries=new Map(series.map(x=>[x.id,x]))
 const occurring=tasks.filter(t=>t.seriesId&&t.recurrenceDate&&t.recurrenceDate>=from&&
  t.recurrenceDate<=addLocalDays(from,6)&&t.status!=='cancelled'&&!t.deletedAt)
  .map(t=>({task:t,series:currentSeries.get(t.seriesId!)}))
 const summary=days.map(date=>{
  const due=fixed.filter(h=>date>=localDateKey(new Date(h.createdAt))&&
   !habitPausedForDate(h,date)&&habitScheduledForDate(h,date))
  const completed=due.filter(h=>byHabit.get(h.id)?.some(e=>e.date===date&&e.status==='completed'))
  const resting=due.filter(h=>byHabit.get(h.id)?.some(e=>e.date===date&&e.status==='skipped'))
  return {date,due:due.length,completed:completed.length,resting:resting.length,
   recurring:occurring.filter(o=>o.task.recurrenceDate===date).length}
 })
 const quotas=flexible.map(h=>{
  const progress=habitPeriodProgress(h,byHabit.get(h.id)??[],from)
  return {id:h.id,title:h.title,completed:progress.completed,target:progress.target,
   label:progress.label,period:progress.period}
 })
 return {summary,quotas,occurring:occurring.sort((a,b)=>
  (a.task.recurrenceDate??'').localeCompare(b.task.recurrenceDate??'')),seriesCount:series.length}
}
