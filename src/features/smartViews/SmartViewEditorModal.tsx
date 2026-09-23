import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import type { ListEntity, SectionEntity, TagEntity } from '../../domain/models'
import {
  createEmptySmartCondition, createEmptySmartGroup,
  type SmartField, type SmartFilterCondition, type SmartFilterGroup, type SmartFilterNode,
  type SmartGroupBy, type SmartOperator, type SmartSortField, type SmartTaskView,
} from './queryEngine'
import type { SmartTaskViewInput } from '../../services/savedViewService'

const fieldLabels: Record<SmartField,string> = {
  text:'Text', status:'Status', priority:'Priority', project:'Project', list:'List', section:'Section', tag:'Tag',
  planned:'Planned date', deadline:'Deadline', recurring:'Recurring', readiness:'Readiness', estimate:'Estimate',
  reminder:'Reminder', pinned:'Pinned', completion:'Completion',
}

const operatorLabels: Partial<Record<SmartOperator,string>> = {
  contains:'contains', 'not-contains':'does not contain', equals:'equals',
  is:'is', 'is-not':'is not', in:'is any of', 'not-in':'is none of', exists:'exists', 'not-exists':'does not exist',
  'has-any':'has any', 'has-all':'has all', 'has-none':'has none',
  on:'on', before:'before', after:'after', 'on-or-before':'on or before', 'on-or-after':'on or after', between:'between',
  today:'today', tomorrow:'tomorrow', 'within-next':'within next', overdue:'overdue',
  lt:'less than', lte:'at most', gt:'greater than', gte:'at least',
}

const operators: Record<SmartField,SmartOperator[]> = {
  text:['contains','not-contains','equals'],
  status:['is','is-not','in','not-in'],
  priority:['is','is-not','in','not-in'],
  project:['is','is-not','in','not-in','exists','not-exists'],
  list:['is','is-not','in','not-in','exists','not-exists'],
  section:['is','is-not','in','not-in','exists','not-exists'],
  tag:['has-any','has-all','has-none','exists','not-exists'],
  planned:['today','tomorrow','overdue','within-next','on','before','after','on-or-before','on-or-after','between','exists','not-exists'],
  deadline:['today','tomorrow','overdue','within-next','on','before','after','on-or-before','on-or-after','between','exists','not-exists'],
  recurring:['is'],
  readiness:['is'],
  estimate:['lt','lte','gt','gte','between','exists','not-exists'],
  reminder:['is'],
  pinned:['is'],
  completion:['is'],
}

function defaultValue(field:SmartField,operator:SmartOperator): SmartFilterCondition['value'] {
  if (operator === 'exists' || operator === 'not-exists' || operator === 'today' || operator === 'tomorrow' || operator === 'overdue') return undefined
  if (operator === 'between') return field === 'estimate' ? [30,120] : ['', '']
  if (operator === 'within-next') return 7
  if (field === 'status') return operator === 'in' || operator === 'not-in' ? ['todo'] : 'todo'
  if (field === 'priority') return operator === 'in' || operator === 'not-in' ? ['high'] : 'high'
  if (field === 'recurring' || field === 'pinned') return true
  if (field === 'readiness') return 'ready'
  if (field === 'reminder') return 'configured'
  if (field === 'completion') return 'open'
  if (field === 'estimate') return 30
  if (field === 'tag' || ['project','list','section'].includes(field)) return ['in','not-in','has-any','has-all','has-none'].includes(operator) ? [] : ''
  return ''
}

function cloneView(view?:SmartTaskView):SmartTaskViewInput {
  if(view) {
    const {id,createdAt:_created,updatedAt:_updated,builtin:_builtin,...rest}=structuredClone(view)
    return {...rest,id}
  }
  return {
    name:'', description:'', color:'#53657d', icon:'', pinned:false, scope:'root',
    query:createEmptySmartGroup(),
    sort:[{field:'planned',direction:'asc'},{field:'priority',direction:'asc'}],
    groupBy:'none',
  }
}

function updateNode(root:SmartFilterGroup,id:string,fn:(node:SmartFilterNode)=>SmartFilterNode):SmartFilterGroup {
  if(root.id===id) return fn(root) as SmartFilterGroup
  return {...root,children:root.children.map((child)=>{
    if(child.id===id) return fn(child)
    return child.type==='group'?updateNode(child,id,fn):child
  })}
}
function removeNode(root:SmartFilterGroup,id:string):SmartFilterGroup {
  return {...root,children:root.children.filter((child)=>child.id!==id).map((child)=>child.type==='group'?removeNode(child,id):child)}
}
function addNode(root:SmartFilterGroup,parentId:string,node:SmartFilterNode):SmartFilterGroup {
  return updateNode(root,parentId,(current)=>current.type==='group'?{...current,children:[...current.children,node]}:current)
}

export function SmartViewEditorModal({open,view,projects,lists,sections,tags,onClose,onSave}:{
  open:boolean
  view?:SmartTaskView
  projects:Array<{id:string;name:string}>
  lists:ListEntity[]
  sections:SectionEntity[]
  tags:TagEntity[]
  onClose:()=>void
  onSave:(view:SmartTaskViewInput)=>Promise<void>
}) {
  const [draft,setDraft]=useState<SmartTaskViewInput>(()=>cloneView(view))
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')

  useEffect(()=>{if(open){setDraft(cloneView(view));setError('')}},[open,view?.id])

  async function save(){
    if(!draft.name.trim()||saving)return
    setSaving(true);setError('')
    try{await onSave(draft);onClose()}catch(reason){setError(reason instanceof Error?reason.message:'Could not save smart view.')}finally{setSaving(false)}
  }

  return <Modal open={open} title={view?'Edit smart view':'Create smart view'} onClose={onClose} className="smart-view-editor-modal" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!draft.name.trim()||saving} onClick={()=>void save()}>{saving?'Saving…':view?'Update view':'Save view'}</Button></>}>
    <div className="smart-view-editor">
      <section className="smart-view-basics">
        <label className="field"><span>Name</span><input value={draft.name} maxLength={80} onChange={(e)=>setDraft({...draft,name:e.target.value})} placeholder="e.g. Exam pressure"/></label>
        <label className="field"><span>Description</span><input value={draft.description??''} maxLength={240} onChange={(e)=>setDraft({...draft,description:e.target.value})} placeholder="What this perspective is for"/></label>
        <div className="smart-view-basics__row">
          <label className="field"><span>Scope</span><select value={draft.scope} onChange={(e)=>setDraft({...draft,scope:e.target.value as 'root'|'all'})}><option value="root">Root tasks</option><option value="all">Root + nested tasks</option></select></label>
          <label className="field"><span>Group results by</span><select value={draft.groupBy} onChange={(e)=>setDraft({...draft,groupBy:e.target.value as SmartGroupBy})}>{(['none','project','list','section','priority','planned','deadline','tag','status','readiness'] as SmartGroupBy[]).map((value)=><option key={value} value={value}>{value[0].toUpperCase()+value.slice(1)}</option>)}</select></label>
          <label className="field"><span>Accent</span><input type="color" value={draft.color??'#53657d'} onChange={(e)=>setDraft({...draft,color:e.target.value})}/></label>
          <label className="check-field smart-view-pin"><input type="checkbox" checked={draft.pinned} onChange={(e)=>setDraft({...draft,pinned:e.target.checked})}/><span>Pin to sidebar</span></label>
        </div>
      </section>

      <section className="smart-query-section">
        <div className="smart-query-section__head"><div><span className="eyebrow">Filter logic</span><h3>Match tasks where…</h3></div></div>
        <QueryGroupEditor
          group={draft.query}
          depth={0}
          projects={projects}
          lists={lists}
          sections={sections}
          tags={tags}
          onChange={(query)=>setDraft({...draft,query})}
        />
      </section>

      <section className="smart-sort-section">
        <div><span className="eyebrow">Sorting</span><h3>Then order matches by</h3></div>
        <div className="smart-sort-list">
          {draft.sort.map((rule,index)=><div className="smart-sort-row" key={index}>
            <span>{index+1}</span>
            <select value={rule.field} onChange={(e)=>{const sort=[...draft.sort];sort[index]={...rule,field:e.target.value as SmartSortField};setDraft({...draft,sort})}}>{(['manual','planned','deadline','priority','estimate','title','created','updated'] as SmartSortField[]).map((field)=><option key={field} value={field}>{field}</option>)}</select>
            <select value={rule.direction} onChange={(e)=>{const sort=[...draft.sort];sort[index]={...rule,direction:e.target.value as 'asc'|'desc'};setDraft({...draft,sort})}}><option value="asc">Ascending</option><option value="desc">Descending</option></select>
            <button type="button" disabled={draft.sort.length===1} onClick={()=>setDraft({...draft,sort:draft.sort.filter((_,i)=>i!==index)})}>×</button>
          </div>)}
        </div>
        {draft.sort.length<4?<Button onClick={()=>setDraft({...draft,sort:[...draft.sort,{field:'planned',direction:'asc'}]})}>Add sort</Button>:null}
      </section>
      {error?<div className="form-error">{error}</div>:null}
    </div>
  </Modal>
}

function QueryGroupEditor({group,depth,projects,lists,sections,tags,onChange}:{
  group:SmartFilterGroup;depth:number;projects:Array<{id:string;name:string}>;lists:ListEntity[];sections:SectionEntity[];tags:TagEntity[];onChange:(group:SmartFilterGroup)=>void
}) {
  return <div className="smart-filter-group" data-depth={depth}>
    <div className="smart-filter-group__head">
      <select value={group.operator} onChange={(e)=>onChange({...group,operator:e.target.value as 'and'|'or'})}><option value="and">ALL · AND</option><option value="or">ANY · OR</option></select>
      <label><input type="checkbox" checked={Boolean(group.negated)} onChange={(e)=>onChange({...group,negated:e.target.checked})}/><span>NOT this group</span></label>
      <span>{group.children.length} rule{group.children.length===1?'':'s'}</span>
    </div>
    <div className="smart-filter-group__children">
      {group.children.map((child)=>child.type==='group'
        ? <div className="smart-filter-nested" key={child.id}><QueryGroupEditor group={child} depth={depth+1} projects={projects} lists={lists} sections={sections} tags={tags} onChange={(next)=>onChange(updateNode(group,child.id,()=>next))}/><button type="button" className="smart-rule-remove" onClick={()=>onChange(removeNode(group,child.id))}>Remove group</button></div>
        : <ConditionEditor key={child.id} condition={child} projects={projects} lists={lists} sections={sections} tags={tags} onChange={(next)=>onChange(updateNode(group,child.id,()=>next))} onRemove={()=>onChange(removeNode(group,child.id))}/>)}
      {!group.children.length?<div className="smart-filter-empty">An empty group matches everything. Add rules to narrow it.</div>:null}
    </div>
    <div className="smart-filter-group__actions">
      <Button onClick={()=>onChange(addNode(group,group.id,createEmptySmartCondition()))}>Add rule</Button>
      {depth<4?<Button onClick={()=>onChange(addNode(group,group.id,createEmptySmartGroup()))}>Add group</Button>:null}
    </div>
  </div>
}

function ConditionEditor({condition,projects,lists,sections,tags,onChange,onRemove}:{
  condition:SmartFilterCondition;projects:Array<{id:string;name:string}>;lists:ListEntity[];sections:SectionEntity[];tags:TagEntity[];onChange:(condition:SmartFilterCondition)=>void;onRemove:()=>void
}) {
  const ops=operators[condition.field]
  function changeField(field:SmartField){
    const operator=operators[field][0]
    onChange({...condition,field,operator,value:defaultValue(field,operator),includeDescendants:field==='tag'?true:undefined})
  }
  function changeOperator(operator:SmartOperator){onChange({...condition,operator,value:defaultValue(condition.field,operator)})}
  return <div className="smart-condition-row">
    <select value={condition.field} onChange={(e)=>changeField(e.target.value as SmartField)}>{(Object.keys(fieldLabels) as SmartField[]).map((field)=><option key={field} value={field}>{fieldLabels[field]}</option>)}</select>
    <select value={condition.operator} onChange={(e)=>changeOperator(e.target.value as SmartOperator)}>{ops.map((op)=><option key={op} value={op}>{operatorLabels[op]??op}</option>)}</select>
    <ConditionValue condition={condition} projects={projects} lists={lists} sections={sections} tags={tags} onChange={onChange}/>
    {condition.field==='tag' && !['exists','not-exists'].includes(condition.operator)?<label className="smart-descendants"><input type="checkbox" checked={Boolean(condition.includeDescendants)} onChange={(e)=>onChange({...condition,includeDescendants:e.target.checked})}/><span>include child tags</span></label>:null}
    <button type="button" className="smart-condition-remove" aria-label="Remove rule" onClick={onRemove}>×</button>
  </div>
}

function ConditionValue({condition,projects,lists,sections,tags,onChange}:{
  condition:SmartFilterCondition;projects:Array<{id:string;name:string}>;lists:ListEntity[];sections:SectionEntity[];tags:TagEntity[];onChange:(condition:SmartFilterCondition)=>void
}) {
  const noValue=['exists','not-exists','today','tomorrow','overdue'].includes(condition.operator)
  if(noValue)return <span className="smart-condition-value is-static">—</span>
  if(condition.operator==='between'){
    const values=Array.isArray(condition.value)?condition.value:[condition.field==='estimate'?30:'',condition.field==='estimate'?120:'']
    if(condition.field==='estimate') return <span className="smart-between"><input type="number" min="0" value={Number(values[0]??0)} onChange={(e)=>onChange({...condition,value:[Number(e.target.value),Number(values[1]??0)] as [number,number]})}/><b>and</b><input type="number" min="0" value={Number(values[1]??0)} onChange={(e)=>onChange({...condition,value:[Number(values[0]??0),Number(e.target.value)] as [number,number]})}/></span>
    return <span className="smart-between"><input type="date" value={String(values[0]??'')} onChange={(e)=>onChange({...condition,value:[e.target.value,String(values[1]??'')] as [string,string]})}/><b>and</b><input type="date" value={String(values[1]??'')} onChange={(e)=>onChange({...condition,value:[String(values[0]??''),e.target.value] as [string,string]})}/></span>
  }
  if(condition.operator==='within-next') return <span className="smart-number-unit"><input type="number" min="0" max="3650" value={typeof condition.value==='number'?condition.value:7} onChange={(e)=>onChange({...condition,value:Number(e.target.value)})}/><span>days</span></span>
  if(condition.field==='planned'||condition.field==='deadline') return <input className="smart-condition-value" type="date" value={typeof condition.value==='string'?condition.value:''} onChange={(e)=>onChange({...condition,value:e.target.value})}/>
  if(condition.field==='estimate') return <span className="smart-number-unit"><input type="number" min="0" max="1440" value={typeof condition.value==='number'?condition.value:30} onChange={(e)=>onChange({...condition,value:Number(e.target.value)})}/><span>min</span></span>
  if(condition.field==='recurring'||condition.field==='pinned') return <select className="smart-condition-value" value={String(Boolean(condition.value))} onChange={(e)=>onChange({...condition,value:e.target.value==='true'})}><option value="true">Yes</option><option value="false">No</option></select>
  if(condition.field==='readiness') return <select className="smart-condition-value" value={String(condition.value??'ready')} onChange={(e)=>onChange({...condition,value:e.target.value})}><option value="ready">Ready</option><option value="blocked">Blocked</option></select>
  if(condition.field==='reminder') return <select className="smart-condition-value" value={String(condition.value??'configured')} onChange={(e)=>onChange({...condition,value:e.target.value})}><option value="configured">Configured</option><option value="none">None</option><option value="due">Due</option><option value="snoozed">Snoozed</option><option value="outstanding">Outstanding</option></select>
  if(condition.field==='completion') return <select className="smart-condition-value" value={String(condition.value??'open')} onChange={(e)=>onChange({...condition,value:e.target.value})}><option value="open">Open</option><option value="completed">Completed</option></select>

  if(condition.field==='status') return <EntityValue condition={condition} options={[['inbox','Inbox'],['todo','To do'],['completed','Completed']]} onChange={onChange}/>
  if(condition.field==='priority') return <EntityValue condition={condition} options={[['normal','Normal'],['high','High'],['critical','Critical']]} onChange={onChange}/>
  if(condition.field==='project') return <EntityValue condition={condition} options={projects.map((item)=>[item.id,item.name] as [string,string])} onChange={onChange}/>
  if(condition.field==='list') return <EntityValue condition={condition} options={lists.map((item)=>[item.id,item.name] as [string,string])} onChange={onChange}/>
  if(condition.field==='section') return <EntityValue condition={condition} options={sections.map((item)=>[item.id,item.name] as [string,string])} onChange={onChange}/>
  if(condition.field==='tag') return <EntityValue condition={condition} options={tags.map((item)=>[item.id,'#'+item.name] as [string,string])} onChange={onChange} multiple/>

  return <input className="smart-condition-value" value={typeof condition.value==='string'?condition.value:''} onChange={(e)=>onChange({...condition,value:e.target.value})} placeholder="Value"/>
}

function EntityValue({condition,options,onChange,multiple=false}:{
  condition:SmartFilterCondition;options:[string,string][];onChange:(condition:SmartFilterCondition)=>void;multiple?:boolean
}) {
  const isMulti=multiple||['in','not-in','has-any','has-all','has-none'].includes(condition.operator)
  if(isMulti){
    const selected=Array.isArray(condition.value)?condition.value.filter((item):item is string=>typeof item==='string'):[]
    return <select className="smart-condition-value" multiple value={selected} onChange={(e)=>onChange({...condition,value:Array.from(e.target.selectedOptions).map((option)=>option.value)})}>{options.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
  }
  return <select className="smart-condition-value" value={typeof condition.value==='string'?condition.value:''} onChange={(e)=>onChange({...condition,value:e.target.value})}><option value="">Choose…</option>{options.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
}
