import { localDateKey } from '../domain/date'
import type { FolioTemplateDefinition, TimeBlockEntity } from '../domain/models'
import { timeBlockRepository } from '../repositories/timeBlockRepository'
import { settingsRepository } from '../repositories/settingsRepository'
import { taskService } from './taskService'
import { templateService } from './templateService'
import { automationService } from './automationService'
import type { UndoableMutation } from './undo'

export type IntegrationIntent =
  | { type:'capture'; title:string; text?:string; url?:string; projectId?:string; plannedDate?:string; source:'url'|'share-target'|'protocol' }
  | { type:'template'; templateId:string; anchorDate?:string; source:'url'|'protocol' }
  | { type:'automation'; ruleId:string; taskId:string; source:'url'|'protocol' }

export interface ParsedEmailCapture {
  subject:string
  from?:string
  date?:string
  body:string
  firstUrl?:string
}

export interface IntegrationHistoryEntry {
  id:string
  kind:'capture'|'email'|'template'|'automation'|'calendar-google'|'calendar-outlook'|'calendar-ics'|'protocol'
  label:string
  detail?:string
  at:string
}

const HISTORY_KEY='integrations.history.v1'
const MAX_HISTORY=120

function now(){return new Date().toISOString()}
function safeDate(value:string|undefined){return value&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value:undefined}
function safeHttpUrl(value:string|undefined){
  if(!value)return undefined
  try{const url=new URL(value);return url.protocol==='http:'||url.protocol==='https:'?url.toString():undefined}catch{return undefined}
}
function historyRows(value:unknown):IntegrationHistoryEntry[]{
  if(!Array.isArray(value))return[]
  return value.filter((row):row is IntegrationHistoryEntry=>Boolean(row&&typeof row==='object'&&typeof (row as any).id==='string'&&typeof (row as any).kind==='string'&&typeof (row as any).at==='string')).slice(0,MAX_HISTORY)
}
async function record(kind:IntegrationHistoryEntry['kind'],label:string,detail?:string){
  const rows=historyRows(await settingsRepository.get<unknown>(HISTORY_KEY,[]))
  await settingsRepository.set(HISTORY_KEY,[{id:crypto.randomUUID(),kind,label,detail,at:now()},...rows].slice(0,MAX_HISTORY))
}
function stripActionParams(url:URL){
  for(const key of ['folioAction','folioProtocol','title','text','url','projectId','plannedDate','templateId','anchorDate','ruleId','taskId'])url.searchParams.delete(key)
  window.history.replaceState(null,'',url)
}
function parseWebFolio(value:string){
  const decoded=decodeURIComponent(value)
  if(!decoded.startsWith('web+folio:'))return null
  const body=decoded.slice('web+folio:'.length)
  const question=body.indexOf('?')
  const action=(question<0?body:body.slice(0,question)).replace(/^\/+/,'')
  const params=new URLSearchParams(question<0?'':body.slice(question+1))
  return {action,params}
}
function intentFrom(action:string,params:URLSearchParams,source:IntegrationIntent['source']):IntegrationIntent|null{
  if(action==='capture'||action==='share-target'){
    const title=(params.get('title')||'').trim()
    const text=(params.get('text')||'').trim()
    const url=safeHttpUrl(params.get('url')||undefined)
    const fallback=title||text.split(/\r?\n/).find(Boolean)?.trim()||url||'Shared to Folio'
    return {type:'capture',title:fallback.slice(0,300),text:text||undefined,url,projectId:params.get('projectId')||undefined,plannedDate:safeDate(params.get('plannedDate')||undefined),source:action==='share-target'?'share-target':source}
  }
  if(action==='template'){
    const templateId=params.get('templateId')||''
    if(!templateId)return null
    return {type:'template',templateId,anchorDate:safeDate(params.get('anchorDate')||undefined),source}
  }
  if(action==='automation'){
    const ruleId=params.get('ruleId')||'',taskId=params.get('taskId')||''
    if(!ruleId||!taskId)return null
    return {type:'automation',ruleId,taskId,source}
  }
  return null
}
function utcStamp(value:string){return new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z')}
function escapeIcs(value:string){return value.replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;')}
function blockDetails(block:TimeBlockEntity){return [block.description,block.taskId?'Created from a Folio task time block':undefined].filter(Boolean).join('\n')}

export const externalIntegrationService={
  async listHistory(){return historyRows(await settingsRepository.get<unknown>(HISTORY_KEY,[]))},
  async clearHistory(){await settingsRepository.set(HISTORY_KEY,[])},

  consumeCurrentUrl():IntegrationIntent|null{
    const current=new URL(window.location.href)
    let intent:IntegrationIntent|null=null
    const protocol=current.searchParams.get('folioProtocol')
    if(protocol){
      const parsed=parseWebFolio(protocol)
      if(parsed)intent=intentFrom(parsed.action,parsed.params,'protocol')
    }else{
      const action=current.searchParams.get('folioAction')
      if(action)intent=intentFrom(action,current.searchParams,'url')
    }
    if(intent)stripActionParams(current)
    return intent
  },

  buildCaptureUrl(base:string,input:{title?:string;text?:string;url?:string;projectId?:string;plannedDate?:string}){
    const target=new URL(base)
    target.searchParams.set('folioAction','capture')
    if(input.title?.trim())target.searchParams.set('title',input.title.trim())
    if(input.text?.trim())target.searchParams.set('text',input.text.trim())
    const url=safeHttpUrl(input.url);if(url)target.searchParams.set('url',url)
    if(input.projectId)target.searchParams.set('projectId',input.projectId)
    const date=safeDate(input.plannedDate);if(date)target.searchParams.set('plannedDate',date)
    return target.toString()
  },

  buildTemplateUrl(base:string,templateId:string,anchorDate?:string){
    const target=new URL(base);target.searchParams.set('folioAction','template');target.searchParams.set('templateId',templateId)
    const date=safeDate(anchorDate);if(date)target.searchParams.set('anchorDate',date)
    return target.toString()
  },

  buildAutomationUrl(base:string,ruleId:string,taskId:string){
    const target=new URL(base);target.searchParams.set('folioAction','automation');target.searchParams.set('ruleId',ruleId);target.searchParams.set('taskId',taskId)
    return target.toString()
  },

  protocolExample(action:'capture'|'template'|'automation',params:Record<string,string>){
    const query=new URLSearchParams(params).toString()
    return 'web+folio:'+action+(query?'?'+query:'')
  },

  async registerProtocolHandler(){
    if(!('registerProtocolHandler' in navigator))throw new Error('Custom protocol registration is not supported in this browser.')
    const base=new URL(import.meta.env.BASE_URL,window.location.href)
    base.searchParams.set('folioProtocol','%s')
    navigator.registerProtocolHandler('web+folio',base.toString())
    await record('protocol','web+folio handler requested','Browser approval may still be required.')
  },

  bookmarklet(base:string){
    const encoded=JSON.stringify(base)
    return "javascript:(()=>{const u=new URL("+encoded+");u.searchParams.set('folioAction','capture');u.searchParams.set('title',document.title);u.searchParams.set('url',location.href);const s=String(getSelection?.()||'').trim();if(s)u.searchParams.set('text',s);location.href=u.toString()})()"
  },

  parseEmail(text:string):ParsedEmailCapture{
    const clean=text.replace(/\r\n/g,'\n').trim()
    const lines=clean.split('\n')
    let subject='',from='',date='',bodyStart=0
    for(let i=0;i<Math.min(lines.length,40);i++){
      const line=lines[i]
      if(!line.trim()){bodyStart=i+1;break}
      const match=line.match(/^([A-Za-z-]+):\s*(.*)$/)
      if(!match){if(!bodyStart)bodyStart=i;continue}
      const key=match[1].toLowerCase(),value=match[2].trim()
      if(key==='subject')subject=value
      else if(key==='from')from=value
      else if(key==='date')date=value
      bodyStart=i+1
    }
    let body=lines.slice(bodyStart).join('\n').trim()
    if(!subject){
      const first=lines.find((line)=>line.trim()&&!/^(from|to|date|cc):/i.test(line))
      subject=(first||'Email follow-up').trim()
      if(body===clean)body=lines.slice(lines.indexOf(first||'')+1).join('\n').trim()
    }
    const firstUrl=body.match(/https?:\/\/[^\s<>()]+/i)?.[0]
    return {subject:subject.slice(0,300),from:from||undefined,date:date||undefined,body,firstUrl:safeHttpUrl(firstUrl)}
  },

  async createTaskFromEmail(raw:string):Promise<{undo:UndoableMutation;taskId:string;preview:ParsedEmailCapture}>{
    const preview=this.parseEmail(raw)
    if(!preview.subject.trim())throw new Error('Email capture needs a subject or first-line title.')
    const description=[preview.from?'From: '+preview.from:undefined,preview.date?'Date: '+preview.date:undefined,preview.body].filter(Boolean).join('\n\n')
    const {task,undo}=await taskService.createUndoable({title:preview.subject,description,status:'inbox',sourceUrl:preview.firstUrl})
    await record('email',task.title,preview.from)
    return {undo,taskId:task.id,preview}
  },

  async executeIntent(intent:IntegrationIntent):Promise<{undo:UndoableMutation;open?:{type:'task'|'project'|'template';id:string}}>{
    if(intent.type==='capture'){
      const description=[intent.text,intent.url].filter(Boolean).join('\n\n')
      const {task,undo}=await taskService.createUndoable({title:intent.title,description,status:intent.plannedDate?'todo':'inbox',plannedDate:intent.plannedDate,projectId:intent.projectId,sourceUrl:intent.url})
      await record('capture',task.title,intent.source)
      return {undo,open:{type:'task',id:task.id}}
    }
    if(intent.type==='template'){
      const template=await templateService.get(intent.templateId);if(!template)throw new Error('Template no longer exists.')
      if(template.kind==='task'){
        const result=await templateService.instantiateTask(template.id,{anchorDate:intent.anchorDate||localDateKey()})
        await record('template',template.name,intent.source)
        return {undo:result.undo,open:{type:'task',id:result.task.id}}
      }
      const result=await templateService.instantiateProject(template.id,{anchorDate:intent.anchorDate||localDateKey()})
      await record('template',template.name,intent.source)
      return {undo:result.undo,open:{type:'project',id:result.projectId}}
    }
    const undo=await automationService.runManual(intent.ruleId,intent.taskId,localDateKey())
    await record('automation','Automation endpoint executed',intent.source)
    return {undo}
  },

  async calendarLinks(blockId:string){
    const block=await timeBlockRepository.get(blockId);if(!block)throw new Error('Calendar item not found.')
    const details=blockDetails(block)
    const google=new URL('https://calendar.google.com/calendar/render')
    google.searchParams.set('action','TEMPLATE');google.searchParams.set('text',block.title)
    google.searchParams.set('dates',utcStamp(block.start)+'/'+utcStamp(block.end))
    if(details)google.searchParams.set('details',details)
    if(block.location)google.searchParams.set('location',block.location)

    const outlook=new URL('https://outlook.office.com/calendar/0/deeplink/compose')
    outlook.searchParams.set('path','/calendar/action/compose');outlook.searchParams.set('rru','addevent')
    outlook.searchParams.set('subject',block.title);outlook.searchParams.set('startdt',new Date(block.start).toISOString());outlook.searchParams.set('enddt',new Date(block.end).toISOString())
    if(details)outlook.searchParams.set('body',details)
    if(block.location)outlook.searchParams.set('location',block.location)
    return {block,google:google.toString(),outlook:outlook.toString()}
  },

  async recordCalendarOpen(provider:'google'|'outlook',block:TimeBlockEntity){await record(provider==='google'?'calendar-google':'calendar-outlook',block.title)},

  async singleEventIcs(blockId:string){
    const block=await timeBlockRepository.get(blockId);if(!block)throw new Error('Calendar item not found.')
    const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Folio//External Integration//EN','CALSCALE:GREGORIAN','BEGIN:VEVENT','UID:'+block.id+'@folio.local','DTSTAMP:'+utcStamp(now()),'DTSTART:'+utcStamp(block.start),'DTEND:'+utcStamp(block.end),'SUMMARY:'+escapeIcs(block.title)]
    const details=blockDetails(block);if(details)lines.push('DESCRIPTION:'+escapeIcs(details))
    if(block.location)lines.push('LOCATION:'+escapeIcs(block.location))
    lines.push('END:VEVENT','END:VCALENDAR')
    await record('calendar-ics',block.title)
    return {block,text:lines.join('\r\n')+'\r\n'}
  },
}
