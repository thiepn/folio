import { addLocalDays, localDateKey, localDateRange, startOfLocalWeek } from '../../domain/date'
import { habitAdherence, habitBestStreak, habitCurrentStreak, habitPausedForDate, habitScheduledForDate } from '../../domain/habit'
import type { DailyPlanEntity, DailyPlanItemEntity, FocusSessionEntity, HabitEntity, HabitEntryEntity, LocalDate, ProjectEntity, TaskEntity, TimeBlockEntity } from '../../domain/models'

export interface AnalyticsInput {
  tasks: TaskEntity[]
  projects: ProjectEntity[]
  focusSessions: FocusSessionEntity[]
  habits: HabitEntity[]
  habitEntries: HabitEntryEntity[]
  dailyPlans: DailyPlanEntity[]
  dailyPlanItems: DailyPlanItemEntity[]
  timeBlocks: TimeBlockEntity[]
  defaultCapacity: number
}

export interface AnalyticsPeriodSummary {
  completedTasks: number
  plannedTasks: number
  plannedCompleted: number
  planCompletionRate: number | null
  dueTasks: number
  overdueTasks: number
  overdueRate: number | null
  focusSeconds: number
  focusSessions: number
  manualFocusSeconds: number
  habitAdherencePercent: number
  estimateVariancePercent: number | null
  workloadPercent: number | null
  overloadedDays: number
}

export interface AnalyticsDailyRow {
  date: LocalDate
  plannedTasks: number
  plannedCompleted: number
  completedTasks: number
  focusSeconds: number
  plannedMinutes: number
  scheduledMinutes: number
  capacityMinutes: number
  workloadPercent: number
}

export interface AnalyticsTrendRow {
  start: LocalDate
  label: string
  completedTasks: number
  plannedTasks: number
  plannedCompleted: number
  planRate: number | null
  focusSeconds: number
}

export interface AnalyticsProjectRow {
  id: string
  name: string
  color?: string
  completedTasks: number
  focusSeconds: number
  openTasks: number
  velocityPerWeek: number
}

export interface AnalyticsHabitRow {
  id: string
  title: string
  adherencePercent: number
  currentStreak: number
  bestStreak: number
  completions: number
}

export interface AnalyticsPatternRow {
  key: string
  label: string
  completedTasks: number
  focusSeconds: number
  plannedTasks: number
  planRate: number | null
}

export interface AnalyticsCalibrationRow {
  id: string
  title: string
  estimateMinutes: number
  actualMinutes: number
  variancePercent: number
}

export interface AnalyticsReportRow {
  key: string
  label: string
  completedTasks: number
  plannedTasks: number
  planRate: number | null
  focusSeconds: number
  overdueRate: number | null
}

export interface AnalyticsSnapshot {
  fromDate: LocalDate
  throughDate: LocalDate
  summary: AnalyticsPeriodSummary
  previousSummary: AnalyticsPeriodSummary
  daily: AnalyticsDailyRow[]
  weekly: AnalyticsTrendRow[]
  projects: AnalyticsProjectRow[]
  habits: AnalyticsHabitRow[]
  weekdays: AnalyticsPatternRow[]
  timeOfDay: AnalyticsPatternRow[]
  calibration: AnalyticsCalibrationRow[]
  monthly: AnalyticsReportRow[]
  yearly: AnalyticsReportRow[]
}

const DAY_MS=86_400_000
const weekdayLabels=['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

function dayCount(from:LocalDate,through:LocalDate){
  return Math.max(1,Math.round((new Date(`${through}T12:00:00`).getTime()-new Date(`${from}T12:00:00`).getTime())/DAY_MS)+1)
}
function inRange(date:string|undefined,from:LocalDate,through:LocalDate){return Boolean(date&&date>=from&&date<=through)}
function dateOf(iso?:string){return iso?localDateKey(new Date(iso)):undefined}
function rootTask(task:TaskEntity){return !task.parentTaskId&&task.status!=='cancelled'}
function currentlyRelevantTask(task:TaskEntity){return rootTask(task)&&(!task.deletedAt||Boolean(task.completedAt))}
function durationMinutes(start:string,end:string){return Math.max(0,Math.round((Date.parse(end)-Date.parse(start))/60_000))}
function timeBucket(iso:string){
  const hour=new Date(iso).getHours()
  if(hour<6)return 'night'
  if(hour<12)return 'morning'
  if(hour<18)return 'afternoon'
  if(hour<22)return 'evening'
  return 'night'
}
const timeLabels:Record<string,string>={morning:'Morning · 06–12',afternoon:'Afternoon · 12–18',evening:'Evening · 18–22',night:'Night · 22–06'}

function rangeHabitEnd(habit:HabitEntity,through:LocalDate){
  const archived=dateOf(habit.archivedAt)
  return archived&&archived<through?archived:through
}
function habitCapacityForDate(habit:HabitEntity,entries:Map<string,HabitEntryEntity>,date:LocalDate){
  if(!habit.countsTowardCapacity||habit.kind!=='duration'||habitPausedForDate(habit,date))return 0
  if(habit.schedule.type==='times-per-week'||habit.schedule.type==='times-per-month') return entries.has(`${habit.id}:${date}`)?habit.target:0
  return habitScheduledForDate(habit,date)?habit.target:0
}
function completedOnOrBefore(task:TaskEntity,date:LocalDate){
  const completed=dateOf(task.completedAt)
  return Boolean(completed&&completed<=date)
}
function sessionProjectId(session:FocusSessionEntity,taskMap:Map<string,TaskEntity>){
  return session.projectIdSnapshot??(session.taskId?taskMap.get(session.taskId)?.projectId:undefined)
}

function dailyRows(input:AnalyticsInput,from:LocalDate,through:LocalDate):AnalyticsDailyRow[]{
  const taskMap=new Map(input.tasks.map((task)=>[task.id,task]))
  const planMap=new Map(input.dailyPlans.map((plan)=>[plan.date,plan]))
  const itemsByDate=new Map<LocalDate,DailyPlanItemEntity[]>()
  for(const item of input.dailyPlanItems) if(inRange(item.date,from,through)) itemsByDate.set(item.date,[...(itemsByDate.get(item.date)??[]),item])
  const entries=new Map(input.habitEntries.map((entry)=>[`${entry.habitId}:${entry.date}`,entry]))
  const finished=input.focusSessions.filter((session)=>session.status==='finished')
  return localDateRange(from,dayCount(from,through)).map((date)=>{
    const items=itemsByDate.get(date)??[]
    const taskIds=[...new Set(items.map((item)=>item.taskId))]
    const plannedTasks=taskIds.map((id)=>taskMap.get(id)).filter((task):task is TaskEntity=>Boolean(task))
    const plannedTaskMinutes=plannedTasks.reduce((sum,task)=>sum+(task.estimatedMinutes??0),0)
    const habitMinutes=input.habits.reduce((sum,habit)=>sum+habitCapacityForDate(habit,entries,date),0)
    const plannedMinutes=plannedTaskMinutes+habitMinutes
    const plannedCompleted=plannedTasks.filter((task)=>completedOnOrBefore(task,date)).length
    const completedTasks=input.tasks.filter(rootTask).filter((task)=>dateOf(task.completedAt)===date).length
    const focusSeconds=finished.filter((session)=>dateOf(session.startedAt)===date).reduce((sum,row)=>sum+row.durationSeconds,0)
    const scheduledMinutes=input.timeBlocks.filter((block)=>block.kind==='task'&&dateOf(block.start)===date).reduce((sum,block)=>sum+durationMinutes(block.start,block.end),0)
    const capacityMinutes=planMap.get(date)?.capacityMinutes??input.defaultCapacity
    const workloadPercent=capacityMinutes?Math.round((plannedMinutes/capacityMinutes)*100):0
    return {date,plannedTasks:plannedTasks.length,plannedCompleted,completedTasks,focusSeconds,plannedMinutes,scheduledMinutes,capacityMinutes,workloadPercent}
  })
}

function habitStats(input:AnalyticsInput,from:LocalDate,through:LocalDate){
  const byHabit=new Map<string,HabitEntryEntity[]>()
  for(const entry of input.habitEntries){const list=byHabit.get(entry.habitId)??[];list.push(entry);byHabit.set(entry.habitId,list)}
  return input.habits.flatMap((habit)=>{
    const effectiveEnd=rangeHabitEnd(habit,through)
    const created=dateOf(habit.createdAt)??from
    const effectiveStart=created>from?created:from
    if(effectiveStart>effectiveEnd)return []
    const entries=byHabit.get(habit.id)??[]
    const adherence=habitAdherence(habit,entries,effectiveStart,effectiveEnd,effectiveEnd)
    return [{id:habit.id,title:habit.title,adherencePercent:adherence.percent,currentStreak:habitCurrentStreak(habit,entries,effectiveEnd),bestStreak:habitBestStreak(habit,entries,effectiveEnd),completions:entries.filter((entry)=>entry.status==='completed'&&inRange(entry.date,effectiveStart,effectiveEnd)).length}]
  }).sort((a,b)=>b.adherencePercent-a.adherencePercent||b.currentStreak-a.currentStreak||a.title.localeCompare(b.title))
}

function calibrationRows(input:AnalyticsInput,from:LocalDate,through:LocalDate):AnalyticsCalibrationRow[]{
  const allFinished=input.focusSessions.filter((session)=>session.status==='finished')
  return input.tasks.filter(rootTask).filter((task)=>inRange(dateOf(task.completedAt),from,through)).flatMap((task)=>{
    const related=allFinished.filter((session)=>session.taskId===task.id)
    const estimate=related.find((session)=>session.taskEstimateMinutesSnapshot)?.taskEstimateMinutesSnapshot??task.estimatedMinutes
    if(!estimate)return []
    const actualSeconds=related.reduce((sum,row)=>sum+row.durationSeconds,0)
    if(!actualSeconds)return []
    const actualMinutes=Math.round(actualSeconds/60)
    return [{id:task.id,title:task.title,estimateMinutes:estimate,actualMinutes,variancePercent:Math.round((actualMinutes/estimate-1)*100)}]
  }).sort((a,b)=>Math.abs(b.variancePercent)-Math.abs(a.variancePercent))
}

function summary(input:AnalyticsInput,from:LocalDate,through:LocalDate,daily:AnalyticsDailyRow[],habits:AnalyticsHabitRow[]):AnalyticsPeriodSummary{
  const roots=input.tasks.filter(rootTask)
  const completed=roots.filter((task)=>inRange(dateOf(task.completedAt),from,through))
  const due=roots.filter(currentlyRelevantTask).filter((task)=>inRange(task.deadline,from,through))
  const overdue=due.filter((task)=>{const completedDate=dateOf(task.completedAt);return !completedDate||completedDate>task.deadline!})
  const finished=input.focusSessions.filter((session)=>session.status==='finished'&&inRange(dateOf(session.startedAt),from,through))
  const plannedTasks=daily.reduce((sum,row)=>sum+row.plannedTasks,0)
  const plannedCompleted=daily.reduce((sum,row)=>sum+row.plannedCompleted,0)
  const calibration=calibrationRows(input,from,through)
  const estimated=calibration.reduce((sum,row)=>sum+row.estimateMinutes,0)
  const actual=calibration.reduce((sum,row)=>sum+row.actualMinutes,0)
  const loadDays=daily.filter((row)=>row.plannedTasks||row.plannedMinutes||row.scheduledMinutes)
  return {
    completedTasks:completed.length,
    plannedTasks,plannedCompleted,
    planCompletionRate:plannedTasks?Math.round(plannedCompleted/plannedTasks*100):null,
    dueTasks:due.length,overdueTasks:overdue.length,overdueRate:due.length?Math.round(overdue.length/due.length*100):null,
    focusSeconds:finished.reduce((sum,row)=>sum+row.durationSeconds,0),focusSessions:finished.length,
    manualFocusSeconds:finished.filter((row)=>row.source==='manual').reduce((sum,row)=>sum+row.durationSeconds,0),
    habitAdherencePercent:habits.length?Math.round(habits.reduce((sum,row)=>sum+row.adherencePercent,0)/habits.length):100,
    estimateVariancePercent:estimated?Math.round((actual/estimated-1)*100):null,
    workloadPercent:loadDays.length?Math.round(loadDays.reduce((sum,row)=>sum+row.workloadPercent,0)/loadDays.length):null,
    overloadedDays:loadDays.filter((row)=>row.workloadPercent>100).length,
  }
}

function weeklyRows(daily:AnalyticsDailyRow[]):AnalyticsTrendRow[]{
  const groups=new Map<string,AnalyticsDailyRow[]>()
  for(const row of daily){const start=startOfLocalWeek(row.date);groups.set(start,[...(groups.get(start)??[]),row])}
  return [...groups.entries()].map(([start,rows])=>{const planned=rows.reduce((sum,row)=>sum+row.plannedTasks,0),done=rows.reduce((sum,row)=>sum+row.plannedCompleted,0);return {start,label:start,completedTasks:rows.reduce((sum,row)=>sum+row.completedTasks,0),plannedTasks:planned,plannedCompleted:done,planRate:planned?Math.round(done/planned*100):null,focusSeconds:rows.reduce((sum,row)=>sum+row.focusSeconds,0)}}).sort((a,b)=>a.start.localeCompare(b.start))
}

function weekdayRows(daily:AnalyticsDailyRow[]):AnalyticsPatternRow[]{
  return Array.from({length:7},(_,index)=>{
    const rows=daily.filter((row)=>new Date(`${row.date}T12:00:00`).getDay()===index)
    const planned=rows.reduce((sum,row)=>sum+row.plannedTasks,0),done=rows.reduce((sum,row)=>sum+row.plannedCompleted,0)
    return {key:String(index),label:weekdayLabels[index],completedTasks:rows.reduce((sum,row)=>sum+row.completedTasks,0),focusSeconds:rows.reduce((sum,row)=>sum+row.focusSeconds,0),plannedTasks:planned,planRate:planned?Math.round(done/planned*100):null}
  })
}

function timeRows(input:AnalyticsInput,from:LocalDate,through:LocalDate):AnalyticsPatternRow[]{
  const roots=input.tasks.filter(rootTask)
  return ['morning','afternoon','evening','night'].map((key)=>{
    const sessions=input.focusSessions.filter((row)=>row.status==='finished'&&inRange(dateOf(row.startedAt),from,through)&&timeBucket(row.startedAt)===key)
    const tasks=roots.filter((task)=>task.completedAt&&inRange(dateOf(task.completedAt),from,through)&&timeBucket(task.completedAt)===key)
    return {key,label:timeLabels[key],completedTasks:tasks.length,focusSeconds:sessions.reduce((sum,row)=>sum+row.durationSeconds,0),plannedTasks:0,planRate:null}
  })
}

function projectRows(input:AnalyticsInput,from:LocalDate,through:LocalDate):AnalyticsProjectRow[]{
  const taskMap=new Map(input.tasks.map((task)=>[task.id,task]))
  const weeks=Math.max(1,dayCount(from,through)/7)
  const map=new Map<string,AnalyticsProjectRow>()
  for(const project of input.projects) map.set(project.id,{id:project.id,name:project.name,color:project.color,completedTasks:0,focusSeconds:0,openTasks:input.tasks.filter((task)=>task.projectId===project.id&&rootActiveTask(task)&&(task.status==='todo'||task.status==='inbox')).length,velocityPerWeek:0})
  const unassigned={id:'__unassigned__',name:'No project',completedTasks:0,focusSeconds:0,openTasks:input.tasks.filter((task)=>!task.projectId&&rootActiveTask(task)&&(task.status==='todo'||task.status==='inbox')).length,velocityPerWeek:0}
  map.set(unassigned.id,unassigned)
  for(const task of input.tasks.filter(rootTask).filter((task)=>inRange(dateOf(task.completedAt),from,through))){const id=task.projectId??'__unassigned__';const row=map.get(id);if(row)row.completedTasks++}
  for(const session of input.focusSessions.filter((row)=>row.status==='finished'&&inRange(dateOf(row.startedAt),from,through))){const id=sessionProjectId(session,taskMap)??'__unassigned__';const row=map.get(id);if(row)row.focusSeconds+=session.durationSeconds}
  for(const row of map.values())row.velocityPerWeek=Math.round(row.completedTasks/weeks*10)/10
  return [...map.values()].filter((row)=>row.completedTasks||row.focusSeconds||row.openTasks).sort((a,b)=>b.focusSeconds-a.focusSeconds||b.completedTasks-a.completedTasks||a.name.localeCompare(b.name))
}

function reportRows(input:AnalyticsInput,daily:AnalyticsDailyRow[],from:LocalDate,through:LocalDate,mode:'month'|'year'):AnalyticsReportRow[]{
  const keys=[...new Set(daily.map((row)=>mode==='month'?row.date.slice(0,7):row.date.slice(0,4)))]
  return keys.map((key)=>{
    const rows=daily.filter((row)=>(mode==='month'?row.date.slice(0,7):row.date.slice(0,4))===key)
    const start=rows[0]?.date??from,end=rows.at(-1)?.date??through
    const roots=input.tasks.filter(rootTask)
    const due=roots.filter((task)=>task.deadline&&task.deadline>=start&&task.deadline<=end)
    const overdue=due.filter((task)=>{const completed=dateOf(task.completedAt);return !completed||completed>task.deadline!})
    const planned=rows.reduce((sum,row)=>sum+row.plannedTasks,0),done=rows.reduce((sum,row)=>sum+row.plannedCompleted,0)
    const label=mode==='month'?new Intl.DateTimeFormat(undefined,{month:'short',year:'numeric'}).format(new Date(`${key}-01T12:00:00`)):key
    return {key,label,completedTasks:rows.reduce((sum,row)=>sum+row.completedTasks,0),plannedTasks:planned,planRate:planned?Math.round(done/planned*100):null,focusSeconds:rows.reduce((sum,row)=>sum+row.focusSeconds,0),overdueRate:due.length?Math.round(overdue.length/due.length*100):null}
  }).sort((a,b)=>a.key.localeCompare(b.key))
}

export function buildAnalyticsSnapshot(input:AnalyticsInput,fromDate:LocalDate,throughDate:LocalDate):AnalyticsSnapshot{
  const days=dayCount(fromDate,throughDate)
  const previousThrough=addLocalDays(fromDate,-1)
  const previousFrom=addLocalDays(previousThrough,-(days-1))
  const daily=dailyRows(input,fromDate,throughDate)
  const previousDaily=dailyRows(input,previousFrom,previousThrough)
  const habits=habitStats(input,fromDate,throughDate)
  const previousHabits=habitStats(input,previousFrom,previousThrough)
  return {
    fromDate,throughDate,
    summary:summary(input,fromDate,throughDate,daily,habits),
    previousSummary:summary(input,previousFrom,previousThrough,previousDaily,previousHabits),
    daily,
    weekly:weeklyRows(daily),
    projects:projectRows(input,fromDate,throughDate),
    habits,
    weekdays:weekdayRows(daily),
    timeOfDay:timeRows(input,fromDate,throughDate),
    calibration:calibrationRows(input,fromDate,throughDate),
    monthly:reportRows(input,daily,fromDate,throughDate,'month'),
    yearly:reportRows(input,daily,fromDate,throughDate,'year'),
  }
}
