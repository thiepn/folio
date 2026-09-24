import { Button } from '../../components/ui/Button'
import { Drawer } from '../../components/ui/Drawer'
import type { HabitTemplateEntity } from '../../domain/models'

function target(template:HabitTemplateEntity){
  if(template.kind==='check')return 'Check'
  if(template.kind==='duration')return `${template.target} min`
  return `${template.target} ${template.unit??'units'}`
}
function schedule(template:HabitTemplateEntity){
  if(template.schedule.type==='daily')return 'Daily'
  if(template.schedule.type==='weekdays')return 'Weekdays'
  if(template.schedule.type==='selected-days')return 'Selected weekdays'
  if(template.schedule.type==='times-per-week')return `${template.schedule.timesPerWeek??1}× / week`
  return `${template.schedule.timesPerMonth??1}× / month`
}
export function HabitTemplatesDrawer({open,templates,onClose,onUse,onRemove}:{open:boolean;templates:HabitTemplateEntity[];onClose:()=>void;onUse:(id:string)=>void;onRemove:(id:string)=>void}){
  return <Drawer open={open} title="Habit templates" onClose={onClose}><div className="habit-template-list">
    <p className="phase-note">Templates copy the definition only. Progress, streaks, history, pauses, and reminders always start fresh.</p>
    {templates.map((template)=><article key={template.id} style={{'--habit-color':template.color??'var(--accent)'} as React.CSSProperties}><i/><div><strong>{template.name}</strong><span>{target(template)} · {schedule(template)}</span><p>{template.description||'No description.'}</p></div><div><Button variant="primary" onClick={()=>onUse(template.id)}>Use template</Button>{!template.builtin?<Button onClick={()=>onRemove(template.id)}>Delete</Button>:<small>Built-in</small>}</div></article>)}
  </div></Drawer>
}
