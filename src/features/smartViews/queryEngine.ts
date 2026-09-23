import { addLocalDays } from '../../domain/date'
import type {
  ListEntity, LocalDate, ProjectEntity, ReminderEntity, ReminderOccurrenceEntity,
  SectionEntity, TagEntity, TaskEntity, TaskPriority, TaskStatus,
} from '../../domain/models'
import { isActiveBlocker } from '../planner/dependencyLogic'

export type SmartLogic = 'and' | 'or'
export type SmartScope = 'root' | 'all'
export type SmartField =
  | 'text' | 'status' | 'priority' | 'project' | 'list' | 'section' | 'tag'
  | 'planned' | 'deadline' | 'recurring' | 'readiness' | 'estimate'
  | 'reminder' | 'pinned' | 'completion'
export type SmartOperator =
  | 'contains' | 'not-contains' | 'equals'
  | 'is' | 'is-not' | 'in' | 'not-in' | 'exists' | 'not-exists'
  | 'has-any' | 'has-all' | 'has-none'
  | 'on' | 'before' | 'after' | 'on-or-before' | 'on-or-after' | 'between'
  | 'today' | 'tomorrow' | 'within-next' | 'overdue'
  | 'lt' | 'lte' | 'gt' | 'gte'
export type SmartSortField = 'manual' | 'planned' | 'deadline' | 'priority' | 'estimate' | 'title' | 'created' | 'updated'
export type SmartGroupBy = 'none' | 'project' | 'list' | 'section' | 'priority' | 'planned' | 'deadline' | 'tag' | 'status' | 'readiness'

export interface SmartFilterCondition {
  id: string
  type: 'condition'
  field: SmartField
  operator: SmartOperator
  value?: string | number | boolean | string[] | [string, string] | [number, number]
  includeDescendants?: boolean
}

export interface SmartFilterGroup {
  id: string
  type: 'group'
  operator: SmartLogic
  negated?: boolean
  children: SmartFilterNode[]
}

export type SmartFilterNode = SmartFilterCondition | SmartFilterGroup

export interface SmartSortRule {
  field: SmartSortField
  direction: 'asc' | 'desc'
}

export interface SmartTaskView {
  id: string
  name: string
  description?: string
  color?: string
  icon?: string
  pinned: boolean
  scope: SmartScope
  query: SmartFilterGroup
  sort: SmartSortRule[]
  groupBy: SmartGroupBy
  createdAt: string
  updatedAt: string
  builtin?: boolean
}

export interface SmartViewContext {
  today: LocalDate
  tasks: TaskEntity[]
  projects: ProjectEntity[]
  lists: ListEntity[]
  sections: SectionEntity[]
  tags: TagEntity[]
  reminders: ReminderEntity[]
  reminderOccurrences: ReminderOccurrenceEntity[]
}

interface SmartRuntime {
  taskMap: Map<string,TaskEntity>
  tagScope: (id:string)=>Set<string>
  directReminderTaskIds: Set<string>
  reminderSeriesIds: Set<string>
  reminderStatesByTask: Map<string,Set<ReminderOccurrenceEntity['status']>>
}

function prepareRuntime(context:SmartViewContext):SmartRuntime {
  const directReminderTaskIds=new Set<string>()
  const reminderSeriesIds=new Set<string>()
  for(const reminder of context.reminders){
    if(!reminder.enabled) continue
    if(reminder.ownerType==='task') directReminderTaskIds.add(reminder.ownerId)
    if(reminder.ownerType==='series') reminderSeriesIds.add(reminder.ownerId)
  }
  const reminderStatesByTask=new Map<string,Set<ReminderOccurrenceEntity['status']>>()
  for(const occurrence of context.reminderOccurrences){
    if(!occurrence.targetTaskId) continue
    const states=reminderStatesByTask.get(occurrence.targetTaskId)??new Set()
    states.add(occurrence.status);reminderStatesByTask.set(occurrence.targetTaskId,states)
  }
  return {
    taskMap:new Map(context.tasks.map((task)=>[task.id,task])),
    tagScope:descendantScopes(context.tags),
    directReminderTaskIds,
    reminderSeriesIds,
    reminderStatesByTask,
  }
}

function taskBlocked(task:TaskEntity,runtime:SmartRuntime){
  return (task.blockedByTaskIds??[]).some((id)=>isActiveBlocker(runtime.taskMap.get(id)))
}

function id(seed: string) { return seed }

export const BUILTIN_SMART_VIEWS: SmartTaskView[] = [
  {
    id:'builtin-all', name:'All tasks', description:'Open and completed work outside Inbox.', pinned:false, scope:'root',
    query:{id:id('g-all'),type:'group',operator:'and',children:[{id:id('c-all-status'),type:'condition',field:'status',operator:'in',value:['todo','completed']}]},
    sort:[{field:'planned',direction:'asc'},{field:'priority',direction:'asc'}], groupBy:'none', createdAt:'', updatedAt:'', builtin:true,
  },
  {
    id:'builtin-unlisted', name:'No list', description:'Open work that has not been organized into a list.', pinned:false, scope:'root',
    query:{id:id('g-unlisted'),type:'group',operator:'and',children:[
      {id:id('c-unlisted-status'),type:'condition',field:'status',operator:'is',value:'todo'},
      {id:id('c-unlisted-list'),type:'condition',field:'list',operator:'not-exists'},
    ]},
    sort:[{field:'priority',direction:'asc'},{field:'planned',direction:'asc'}], groupBy:'project', createdAt:'', updatedAt:'', builtin:true,
  },
  {
    id:'builtin-high-priority', name:'High priority', description:'Open high and critical priority tasks.', pinned:false, scope:'root',
    query:{id:id('g-high'),type:'group',operator:'and',children:[
      {id:id('c-high-status'),type:'condition',field:'status',operator:'is',value:'todo'},
      {id:id('c-high-priority'),type:'condition',field:'priority',operator:'in',value:['high','critical']},
    ]},
    sort:[{field:'priority',direction:'asc'},{field:'deadline',direction:'asc'}], groupBy:'priority', createdAt:'', updatedAt:'', builtin:true,
  },
  {
    id:'builtin-unscheduled', name:'Unscheduled', description:'Open tasks without a planned day.', pinned:false, scope:'root',
    query:{id:id('g-unscheduled'),type:'group',operator:'and',children:[
      {id:id('c-unscheduled-status'),type:'condition',field:'status',operator:'is',value:'todo'},
      {id:id('c-unscheduled-planned'),type:'condition',field:'planned',operator:'not-exists'},
    ]},
    sort:[{field:'deadline',direction:'asc'},{field:'priority',direction:'asc'}], groupBy:'project', createdAt:'', updatedAt:'', builtin:true,
  },
  {
    id:'builtin-blocked', name:'Blocked work', description:'Open tasks waiting on unfinished prerequisites.', pinned:false, scope:'root',
    query:{id:id('g-blocked'),type:'group',operator:'and',children:[
      {id:id('c-blocked-status'),type:'condition',field:'status',operator:'is',value:'todo'},
      {id:id('c-blocked-ready'),type:'condition',field:'readiness',operator:'is',value:'blocked'},
    ]},
    sort:[{field:'deadline',direction:'asc'},{field:'priority',direction:'asc'}], groupBy:'project', createdAt:'', updatedAt:'', builtin:true,
  },
  {
    id:'builtin-due-soon', name:'Due soon', description:'Open work due in the next seven days.', pinned:false, scope:'root',
    query:{id:id('g-due'),type:'group',operator:'and',children:[
      {id:id('c-due-status'),type:'condition',field:'status',operator:'is',value:'todo'},
      {id:id('c-due-date'),type:'condition',field:'deadline',operator:'within-next',value:7},
    ]},
    sort:[{field:'deadline',direction:'asc'},{field:'priority',direction:'asc'}], groupBy:'deadline', createdAt:'', updatedAt:'', builtin:true,
  },
  {
    id:'builtin-recurring', name:'Recurring', description:'Open occurrences belonging to recurring series.', pinned:false, scope:'root',
    query:{id:id('g-recurring'),type:'group',operator:'and',children:[
      {id:id('c-recurring-status'),type:'condition',field:'status',operator:'is',value:'todo'},
      {id:id('c-recurring'),type:'condition',field:'recurring',operator:'is',value:true},
    ]},
    sort:[{field:'planned',direction:'asc'},{field:'deadline',direction:'asc'}], groupBy:'list', createdAt:'', updatedAt:'', builtin:true,
  },
  {
    id:'builtin-reminders', name:'Has reminders', description:'Open tasks with direct or recurring-series reminders.', pinned:false, scope:'root',
    query:{id:id('g-reminders'),type:'group',operator:'and',children:[
      {id:id('c-reminders-status'),type:'condition',field:'status',operator:'is',value:'todo'},
      {id:id('c-reminders'),type:'condition',field:'reminder',operator:'is',value:'configured'},
    ]},
    sort:[{field:'planned',direction:'asc'},{field:'deadline',direction:'asc'}], groupBy:'list', createdAt:'', updatedAt:'', builtin:true,
  },
]

function arrayValue(value: SmartFilterCondition['value']): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : typeof value === 'string' ? [value] : []
}
function stringValue(value: SmartFilterCondition['value']) { return typeof value === 'string' ? value : '' }
function numberValue(value: SmartFilterCondition['value']) { return typeof value === 'number' && Number.isFinite(value) ? value : 0 }
function booleanValue(value: SmartFilterCondition['value']) { return typeof value === 'boolean' ? value : value === 'true' }
function normalized(value: string) { return value.trim().toLocaleLowerCase() }

function compareString(actual: string | undefined, condition: SmartFilterCondition) {
  const expected = stringValue(condition.value)
  if (condition.operator === 'exists') return Boolean(actual)
  if (condition.operator === 'not-exists') return !actual
  if (!actual) return false
  if (condition.operator === 'is') return actual === expected
  if (condition.operator === 'is-not') return actual !== expected
  if (condition.operator === 'in') return arrayValue(condition.value).includes(actual)
  if (condition.operator === 'not-in') return !arrayValue(condition.value).includes(actual)
  return false
}

function compareSet(actual: string[], condition: SmartFilterCondition) {
  const expected = arrayValue(condition.value)
  if (condition.operator === 'exists') return actual.length > 0
  if (condition.operator === 'not-exists') return actual.length === 0
  if (condition.operator === 'has-any' || condition.operator === 'in') return expected.some((item) => actual.includes(item))
  if (condition.operator === 'has-all') return expected.every((item) => actual.includes(item))
  if (condition.operator === 'has-none' || condition.operator === 'not-in') return expected.every((item) => !actual.includes(item))
  if (condition.operator === 'is') return expected.length === 1 && actual.includes(expected[0])
  return false
}

function compareDate(actual: LocalDate | undefined, condition: SmartFilterCondition, today: LocalDate) {
  if (condition.operator === 'exists') return Boolean(actual)
  if (condition.operator === 'not-exists') return !actual
  if (!actual) return false
  const expected = stringValue(condition.value)
  if (condition.operator === 'today') return actual === today
  if (condition.operator === 'tomorrow') return actual === addLocalDays(today, 1)
  if (condition.operator === 'on') return actual === expected
  if (condition.operator === 'before') return actual < expected
  if (condition.operator === 'after') return actual > expected
  if (condition.operator === 'on-or-before') return actual <= expected
  if (condition.operator === 'on-or-after') return actual >= expected
  if (condition.operator === 'overdue') return actual < today
  if (condition.operator === 'within-next') {
    const through = addLocalDays(today, Math.max(0, numberValue(condition.value)))
    return actual >= today && actual <= through
  }
  if (condition.operator === 'between' && Array.isArray(condition.value) && condition.value.length >= 2) {
    const [from,to] = condition.value
    return typeof from === 'string' && typeof to === 'string' && actual >= from && actual <= to
  }
  return false
}

function compareNumber(actual: number | undefined, condition: SmartFilterCondition) {
  if (condition.operator === 'exists') return actual !== undefined
  if (condition.operator === 'not-exists') return actual === undefined
  if (actual === undefined) return false
  const expected = numberValue(condition.value)
  if (condition.operator === 'is') return actual === expected
  if (condition.operator === 'lt') return actual < expected
  if (condition.operator === 'lte') return actual <= expected
  if (condition.operator === 'gt') return actual > expected
  if (condition.operator === 'gte') return actual >= expected
  if (condition.operator === 'between' && Array.isArray(condition.value) && condition.value.length >= 2) {
    const [from,to] = condition.value
    return typeof from === 'number' && typeof to === 'number' && actual >= from && actual <= to
  }
  return false
}

function descendantScopes(tags: TagEntity[]) {
  const children = new Map<string,string[]>()
  for (const tag of tags) {
    if (!tag.parentTagId) continue
    const list = children.get(tag.parentTagId) ?? []
    list.push(tag.id)
    children.set(tag.parentTagId,list)
  }
  const scope = (id: string) => {
    const result = new Set<string>([id]), queue=[id]
    while(queue.length){
      const parent=queue.shift()!
      for(const child of children.get(parent)??[]) if(!result.has(child)){result.add(child);queue.push(child)}
    }
    return result
  }
  return scope
}

function reminderState(task: TaskEntity, runtime: SmartRuntime) {
  const configured = runtime.directReminderTaskIds.has(task.id) || Boolean(task.seriesId && runtime.reminderSeriesIds.has(task.seriesId))
  const occurrenceStates = runtime.reminderStatesByTask.get(task.id) ?? new Set()
  return {
    configured,
    due: occurrenceStates.has('due'),
    snoozed: occurrenceStates.has('snoozed'),
    outstanding: occurrenceStates.has('due') || occurrenceStates.has('snoozed'),
  }
}

export function matchesSmartCondition(task: TaskEntity, condition: SmartFilterCondition, context: SmartViewContext, runtime = prepareRuntime(context)) {
  if (condition.field === 'text') {
    const haystack = normalized([
      task.title, task.description, task.location ?? '', task.sourceUrl ?? '',
      ...(task.tags ?? []), ...(task.comments ?? []).map((comment) => comment.body),
    ].join(' '))
    const needle = normalized(stringValue(condition.value))
    if (condition.operator === 'contains') return haystack.includes(needle)
    if (condition.operator === 'not-contains') return !haystack.includes(needle)
    if (condition.operator === 'equals') return haystack === needle
    return false
  }
  if (condition.field === 'status') return compareString(task.status, condition)
  if (condition.field === 'priority') return compareString(task.priority, condition)
  if (condition.field === 'project') return compareString(task.projectId, condition)
  if (condition.field === 'list') return compareString(task.listId, condition)
  if (condition.field === 'section') return compareString(task.sectionId, condition)
  if (condition.field === 'planned') return compareDate(task.plannedDate, condition, context.today)
  if (condition.field === 'deadline') return compareDate(task.deadline, condition, context.today)
  if (condition.field === 'estimate') return compareNumber(task.estimatedMinutes, condition)
  if (condition.field === 'recurring') return condition.operator === 'is' ? Boolean(task.seriesId) === booleanValue(condition.value) : false
  if (condition.field === 'pinned') return condition.operator === 'is' ? task.pinned === booleanValue(condition.value) : false
  if (condition.field === 'completion') {
    const completed = task.status === 'completed'
    const expected = stringValue(condition.value)
    return condition.operator === 'is' ? (expected === 'completed' ? completed : expected === 'open' ? !completed : false) : false
  }
  if (condition.field === 'readiness') {
    const blocked = taskBlocked(task, runtime)
    const expected = stringValue(condition.value)
    return condition.operator === 'is' ? (expected === 'blocked' ? blocked : expected === 'ready' ? !blocked : false) : false
  }
  if (condition.field === 'tag') {
    const selected = arrayValue(condition.value)
    const expanded = condition.includeDescendants
      ? selected.map((id) => runtime.tagScope(id))
      : selected.map((id) => new Set([id]))
    const actual = task.tagIds ?? []
    if (condition.operator === 'has-any' || condition.operator === 'in') return expanded.some((set) => actual.some((id) => set.has(id)))
    if (condition.operator === 'has-all') return expanded.every((set) => actual.some((id) => set.has(id)))
    if (condition.operator === 'has-none' || condition.operator === 'not-in') return expanded.every((set) => actual.every((id) => !set.has(id)))
    if (condition.operator === 'exists') return actual.length > 0
    if (condition.operator === 'not-exists') return actual.length === 0
    return compareSet(actual,condition)
  }
  if (condition.field === 'reminder') {
    const state = reminderState(task,runtime)
    const expected = stringValue(condition.value)
    if (condition.operator !== 'is') return false
    if (expected === 'configured') return state.configured
    if (expected === 'none') return !state.configured
    if (expected === 'due') return state.due
    if (expected === 'snoozed') return state.snoozed
    if (expected === 'outstanding') return state.outstanding
    return false
  }
  return false
}

export function matchesSmartNode(task: TaskEntity, node: SmartFilterNode, context: SmartViewContext, runtime = prepareRuntime(context)): boolean {
  if (node.type === 'condition') return matchesSmartCondition(task,node,context,runtime)
  const values = node.children.map((child) => matchesSmartNode(task,child,context,runtime))
  const matched = node.children.length === 0 ? true : node.operator === 'and' ? values.every(Boolean) : values.some(Boolean)
  return node.negated ? !matched : matched
}

const priorityRank: Record<TaskPriority,number> = { critical:0, high:1, normal:2 }

function compareByRule(a: TaskEntity,b: TaskEntity,rule:SmartSortRule){
  let result=0
  if(rule.field==='manual') result=a.sortOrder-b.sortOrder
  if(rule.field==='planned') result=(a.plannedDate??'9999').localeCompare(b.plannedDate??'9999')
  if(rule.field==='deadline') result=(a.deadline??'9999').localeCompare(b.deadline??'9999')
  if(rule.field==='priority') result=priorityRank[a.priority]-priorityRank[b.priority]
  if(rule.field==='estimate') result=(a.estimatedMinutes??Number.MAX_SAFE_INTEGER)-(b.estimatedMinutes??Number.MAX_SAFE_INTEGER)
  if(rule.field==='title') result=a.title.localeCompare(b.title)
  if(rule.field==='created') result=a.createdAt.localeCompare(b.createdAt)
  if(rule.field==='updated') result=a.updatedAt.localeCompare(b.updatedAt)
  return rule.direction==='desc' ? -result : result
}

export function runSmartView(view: SmartTaskView, context: SmartViewContext) {
  const runtime=prepareRuntime(context)
  const rows=context.tasks.filter((task)=>{
    if(task.deletedAt || task.status==='cancelled') return false
    if(view.scope==='root' && task.parentTaskId) return false
    return matchesSmartNode(task,view.query,context,runtime)
  })
  const rules=view.sort.length?view.sort:[{field:'manual',direction:'asc'} satisfies SmartSortRule]
  return rows.sort((a,b)=>{
    for(const rule of rules){const result=compareByRule(a,b,rule);if(result!==0)return result}
    return a.sortOrder-b.sortOrder || a.id.localeCompare(b.id)
  })
}

export function smartGroupKey(task:TaskEntity,groupBy:SmartGroupBy,context:SmartViewContext){
  if(groupBy==='none') return {key:'all',label:'Tasks'}
  if(groupBy==='project') return task.projectId
    ? {key:task.projectId,label:context.projects.find((item)=>item.id===task.projectId)?.name??'Unknown project'}
    : {key:'__none__',label:'No project'}
  if(groupBy==='list') return task.listId
    ? {key:task.listId,label:context.lists.find((item)=>item.id===task.listId)?.name??'Unknown list'}
    : {key:'__none__',label:'No list'}
  if(groupBy==='section') return task.sectionId
    ? {key:task.sectionId,label:context.sections.find((item)=>item.id===task.sectionId)?.name??'Unknown section'}
    : {key:'__none__',label:'No section'}
  if(groupBy==='priority') return {key:task.priority,label:task.priority[0].toUpperCase()+task.priority.slice(1)}
  if(groupBy==='status') return {key:task.status,label:task.status[0].toUpperCase()+task.status.slice(1)}
  if(groupBy==='readiness') return taskBlocked(task,prepareRuntime(context))
    ? {key:'blocked',label:'Blocked'}:{key:'ready',label:'Ready'}
  if(groupBy==='planned') return task.plannedDate?{key:task.plannedDate,label:task.plannedDate}:{key:'__none__',label:'Unscheduled'}
  if(groupBy==='deadline') return task.deadline?{key:task.deadline,label:task.deadline}:{key:'__none__',label:'No deadline'}
  if(groupBy==='tag') {
    const first=task.tagIds?.[0]
    return first?{key:first,label:'#'+(context.tags.find((tag)=>tag.id===first)?.name??'Tag')}:{key:'__none__',label:'Untagged'}
  }
  return {key:'all',label:'Tasks'}
}

export function groupSmartViewTasks(tasks:TaskEntity[],view:SmartTaskView,context:SmartViewContext){
  const map=new Map<string,{key:string;label:string;tasks:TaskEntity[]}>()
  for(const task of tasks){
    const group=smartGroupKey(task,view.groupBy,context)
    const row=map.get(group.key)??{...group,tasks:[]}
    row.tasks.push(task);map.set(group.key,row)
  }
  return [...map.values()]
}

export function createEmptySmartGroup(): SmartFilterGroup {
  return { id: crypto.randomUUID(), type:'group', operator:'and', children:[] }
}
export function createEmptySmartCondition(field:SmartField='status'): SmartFilterCondition {
  return { id:crypto.randomUUID(), type:'condition', field, operator:'is', value:field==='status'?'todo':'' }
}
