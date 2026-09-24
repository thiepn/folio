import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button } from '../../components/ui/Button'
import type { HabitEntity } from '../../domain/models'
import { reminderRepository } from '../../repositories/reminderRepository'
import { reminderService } from '../../services/reminderService'

const DAYS=[{value:1,label:'M'},{value:2,label:'T'},{value:3,label:'W'},{value:4,label:'T'},{value:5,label:'F'},{value:6,label:'S'},{value:0,label:'S'}]
function minuteToTime(value:number){return `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`}
function timeToMinute(value:string){const [hour,minute]=value.split(':').map(Number);return hour*60+minute}
function flexible(habit:HabitEntity){return habit.schedule.type==='times-per-week'||habit.schedule.type==='times-per-month'}
function weekdayLabel(days?:number[]){if(!days?.length)return 'Every day';const labels=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];return days.map((day)=>labels[day]).join(' · ')}

export function HabitReminderSection({habit}:{habit:HabitEntity}){
  const reminders=useLiveQuery(()=>reminderRepository.listForOwner('habit',habit.id),[habit.id],[])
  const [time,setTime]=useState('19:00')
  const [persistent,setPersistent]=useState(false)
  const [weekdays,setWeekdays]=useState<number[]>([1,3,5])
  const [error,setError]=useState('')
  const isFlexible=flexible(habit)

  function toggleDay(day:number){setWeekdays((current)=>current.includes(day)?current.filter((value)=>value!==day):[...current,day])}
  async function add(){
    setError('')
    if(isFlexible&&weekdays.length===0){setError('Choose at least one prompt day for this flexible habit.');return}
    try{
      await reminderService.create({ownerType:'habit',ownerId:habit.id,triggerType:'habit-time',minuteOfDay:timeToMinute(time),weekdays:isFlexible?weekdays:undefined,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone||'local',persistent})
      window.dispatchEvent(new Event('folio:reminder-refresh'))
    }catch(reason){setError(reason instanceof Error?reason.message:'Habit reminder could not be added.')}
  }

  return <section className="habit-detail__section habit-reminder-section">
    <div className="section-title-row"><span className="eyebrow">Reminders</span><em>{reminders?.length??0} configured</em></div>
    <div className="habit-reminder-list">{reminders?.map((reminder)=><div key={reminder.id}><div><strong>{minuteToTime(reminder.minuteOfDay??1140)}</strong><span>{isFlexible?`${weekdayLabel(reminder.weekdays)} · `:''}{reminder.persistent?'Persistent · ':''}{reminder.enabled?'Active':'Disabled'}</span></div><div><label className="mini-toggle"><input type="checkbox" checked={reminder.enabled} onChange={(event)=>void reminderService.setEnabled(reminder.id,event.target.checked)}/><span>On</span></label><button type="button" aria-label="Remove habit reminder" onClick={()=>void reminderService.remove(reminder.id)}>×</button></div></div>)}</div>
    <div className="habit-reminder-add">
      <label className="field"><span>Reminder time</span><input type="time" value={time} onChange={(event)=>setTime(event.target.value)}/></label>
      <label className="check-field"><input type="checkbox" checked={persistent} onChange={(event)=>setPersistent(event.target.checked)}/><span>Persistent notification</span></label>
      <Button onClick={()=>void add()}>Add reminder</Button>
    </div>
    {isFlexible?<div className="field habit-reminder-weekdays"><span>Prompt days</span><div className="weekday-picker">{DAYS.map((day,index)=><button type="button" key={`${day.value}-${index}`} className={weekdays.includes(day.value)?'is-active':''} onClick={()=>toggleDay(day.value)}>{day.label}</button>)}</div><small>Prompt days do not change the frequency goal. They only decide when Folio nudges you.</small></div>:<p className="phase-note">Fixed-schedule reminders follow the habit's actual due days automatically.</p>}
    {error?<div className="form-error">{error}</div>:null}
  </section>
}
