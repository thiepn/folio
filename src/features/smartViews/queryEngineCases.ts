import type { ReminderEntity, ReminderOccurrenceEntity, TagEntity, TaskEntity } from '../../domain/models'
import { runSmartView, type SmartTaskView, type SmartViewContext } from './queryEngine'

const now='2026-09-23T10:00:00.000Z'
function task(id:string,partial:Partial<TaskEntity>={}):TaskEntity {
  return {
    id,title:id,description:'',priority:'normal',status:'todo',tags:[],tagIds:[],checklist:[],
    progressMode:'auto',progressPercent:0,timelineMilestone:false,pinned:false,comments:[],activity:[],blockedByTaskIds:[],
    sortOrder:1,rescheduleCount:0,createdAt:now,updatedAt:now,...partial,
  }
}
function view(id:string,query:SmartTaskView['query'],partial:Partial<SmartTaskView>={}):SmartTaskView {
  return {
    id,name:id,pinned:false,scope:'root',query,sort:[{field:'manual',direction:'asc'}],groupBy:'none',
    createdAt:now,updatedAt:now,...partial,
  }
}
function group(children:SmartTaskView['query']['children'],operator:'and'|'or'='and',negated=false):SmartTaskView['query'] {
  return {id:crypto.randomUUID(),type:'group',operator,negated,children}
}
function condition(field:any,operator:any,value?:any,includeDescendants?:boolean):any {
  return {id:crypto.randomUUID(),type:'condition',field,operator,value,includeDescendants}
}

export function validateSmartViewCases() {
  const failures:string[]=[]
  const tags:TagEntity[]=[
    {id:'study',name:'Study',normalizedName:'study',favorite:false,archived:false,sortOrder:1,createdAt:now,updatedAt:now},
    {id:'exam',name:'Exam',normalizedName:'exam',parentTagId:'study',favorite:false,archived:false,sortOrder:2,createdAt:now,updatedAt:now},
    {id:'proof',name:'Proof',normalizedName:'proof',parentTagId:'study',favorite:false,archived:false,sortOrder:3,createdAt:now,updatedAt:now},
  ]
  const tasks:TaskEntity[]=[
    task('a',{title:'Analysis proof sheet',projectId:'uni',listId:'deep',sectionId:'math',priority:'critical',plannedDate:'2026-09-23',deadline:'2026-09-25',estimatedMinutes:90,tagIds:['proof'],tags:['Proof']}),
    task('b',{title:'Exam review',projectId:'uni',listId:'study-list',priority:'high',plannedDate:'2026-09-24',deadline:'2026-09-23',estimatedMinutes:120,tagIds:['exam'],tags:['Exam'],seriesId:'series-1'}),
    task('c',{title:'Email admin',listId:'admin',priority:'normal',estimatedMinutes:15}),
    task('blocker',{title:'Get reference',status:'todo'}),
    task('blocked',{title:'Write report',blockedByTaskIds:['blocker'],deadline:'2026-09-30',estimatedMinutes:180}),
    task('parent',{title:'Parent'}),
    task('child',{title:'Nested child',parentTaskId:'parent',priority:'high'}),
    task('done',{title:'Completed task',status:'completed',completedAt:now}),
  ]
  const reminders:ReminderEntity[]=[
    {id:'rem-a',ownerType:'task',ownerId:'a',triggerType:'task-date',taskDateField:'plannedDate',minuteOfDay:540,timeZone:'Europe/Berlin',persistent:false,enabled:true,createdAt:now,updatedAt:now},
    {id:'rem-series',ownerType:'series',ownerId:'series-1',triggerType:'task-date',taskDateField:'deadline',minuteOfDay:600,timeZone:'Europe/Berlin',persistent:false,enabled:true,createdAt:now,updatedAt:now},
  ]
  const occurrences:ReminderOccurrenceEntity[]=[
    {id:'occ-a',reminderId:'rem-a',ownerType:'task',ownerId:'a',targetTaskId:'a',sourceKey:'x',scheduledFor:now,fireAt:now,status:'due',deliveryCount:1,titleSnapshot:'Analysis proof sheet',createdAt:now,updatedAt:now},
  ]
  const context:SmartViewContext={
    today:'2026-09-23',tasks,
    projects:[{id:'uni',name:'University',description:'',notes:'',type:'academic',status:'active',milestones:[],activity:[],archived:false,favorite:false,createdAt:now,updatedAt:now}],
    lists:[
      {id:'deep',name:'Deep',description:'',favorite:false,archived:false,sortOrder:1,sortMode:'manual',groupMode:'none',showCompleted:true,createdAt:now,updatedAt:now},
      {id:'study-list',name:'Study',description:'',favorite:false,archived:false,sortOrder:2,sortMode:'manual',groupMode:'none',showCompleted:true,createdAt:now,updatedAt:now},
      {id:'admin',name:'Admin',description:'',favorite:false,archived:false,sortOrder:3,sortMode:'manual',groupMode:'none',showCompleted:true,createdAt:now,updatedAt:now},
    ],
    sections:[{id:'math',listId:'deep',name:'Math',sortOrder:1,archived:false,createdAt:now,updatedAt:now}],
    tags,reminders,reminderOccurrences:occurrences,
  }

  const nested=view('nested',group([
    condition('status','is','todo'),
    group([condition('priority','is','critical'),condition('priority','is','high')],'or'),
    group([condition('list','is','admin')],'and',true),
  ]))
  const nestedIds=runSmartView(nested,context).map((row)=>row.id).join(',')
  if(nestedIds!=='a,b') failures.push('nested AND/OR/NOT expected a,b got '+nestedIds)

  const descendants=view('tag-desc',group([condition('tag','has-any',['study'],true)]))
  const descendantIds=runSmartView(descendants,context).map((row)=>row.id).join(',')
  if(descendantIds!=='a,b') failures.push('descendant tags expected a,b got '+descendantIds)

  const dates=view('dates',group([
    condition('planned','within-next',1),
    condition('deadline','on-or-after','2026-09-23'),
  ]),{sort:[{field:'planned',direction:'asc'}]})
  const dateIds=runSmartView(dates,context).map((row)=>row.id).join(',')
  if(dateIds!=='a,b') failures.push('relative date query expected a,b got '+dateIds)

  const overdue=view('overdue',group([condition('deadline','overdue')]))
  const overdueIds=runSmartView(overdue,context).map((row)=>row.id).join(',')
  if(overdueIds!=='') failures.push('deadline equal today must not be overdue: '+overdueIds)

  const reminderView=view('reminders',group([condition('reminder','is','configured')]))
  const reminderIds=runSmartView(reminderView,context).map((row)=>row.id).join(',')
  if(reminderIds!=='a,b') failures.push('direct + series reminders expected a,b got '+reminderIds)

  const dueView=view('due-reminder',group([condition('reminder','is','due')]))
  const dueIds=runSmartView(dueView,context).map((row)=>row.id).join(',')
  if(dueIds!=='a') failures.push('due reminder expected a got '+dueIds)

  const readiness=view('blocked',group([condition('readiness','is','blocked')]))
  const blockedIds=runSmartView(readiness,context).map((row)=>row.id).join(',')
  if(blockedIds!=='blocked') failures.push('blocked readiness expected blocked got '+blockedIds)

  const estimate=view('estimate',group([condition('estimate','between',[60,150])]),{sort:[{field:'estimate',direction:'desc'}]})
  const estimateIds=runSmartView(estimate,context).map((row)=>row.id).join(',')
  if(estimateIds!=='b,a') failures.push('estimate range/sort expected b,a got '+estimateIds)

  const deadlineDesc=view('deadline-desc',group([condition('status','is','todo')]),{sort:[{field:'deadline',direction:'desc'}]})
  const deadlineDescRows=runSmartView(deadlineDesc,context)
  if(deadlineDescRows[0]?.id!=='blocked'||deadlineDescRows.at(-1)?.deadline!==undefined) failures.push('descending deadline sort must keep missing dates last')

  const recurring=view('recurring',group([condition('recurring','is',true)]))
  const recurringIds=runSmartView(recurring,context).map((row)=>row.id).join(',')
  if(recurringIds!=='b') failures.push('recurring expected b got '+recurringIds)

  const rootScope=view('root-scope',group([condition('priority','is','high')]),{scope:'root'})
  if(runSmartView(rootScope,context).some((row)=>row.id==='child')) failures.push('root scope included nested child')

  const allScope=view('all-scope',group([condition('priority','is','high')]),{scope:'all'})
  const allIds=runSmartView(allScope,context).map((row)=>row.id)
  if(!allIds.includes('child')) failures.push('all scope omitted nested child')

  const textView=view('text',group([condition('text','contains','proof')]))
  if(runSmartView(textView,context).map((row)=>row.id).join(',')!=='a') failures.push('text search did not match title/tag content')

  const completed=view('completed',group([condition('completion','is','completed')]))
  if(runSmartView(completed,context).map((row)=>row.id).join(',')!=='done') failures.push('completion predicate failed')

  return failures
}
