import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Drawer } from '../../components/ui/Drawer'
import type { HabitGroupEntity } from '../../domain/models'

export function HabitGroupsDrawer({open,groups,onClose,onCreate,onUpdate,onRemove}:{open:boolean;groups:HabitGroupEntity[];onClose:()=>void;onCreate:(name:string,color:string)=>void;onUpdate:(id:string,changes:{name?:string;color?:string})=>void;onRemove:(id:string)=>void}) {
  const [name,setName]=useState(''),[color,setColor]=useState('#4169FF')
  return <Drawer open={open} title="Habit groups" onClose={onClose}><div className="habit-group-manager">
    <p className="phase-note">Groups organize the Habits surface only. Removing a group keeps every habit and moves its members to Ungrouped.</p>
    <form onSubmit={(event)=>{event.preventDefault();if(!name.trim())return;onCreate(name.trim(),color);setName('')}} className="habit-group-create"><input value={name} onChange={(e)=>setName(e.target.value)} placeholder="Health, Languages, Training…" /><input type="color" value={color} onChange={(e)=>setColor(e.target.value)}/><Button type="submit" variant="primary" disabled={!name.trim()}>Add group</Button></form>
    <div className="habit-group-manager__list">{groups.map((group)=><div key={group.id}><input defaultValue={group.name} onBlur={(event)=>{const next=event.target.value.trim();if(next&&next!==group.name)onUpdate(group.id,{name:next})}}/><input type="color" value={group.color??'#4169FF'} onChange={(event)=>onUpdate(group.id,{color:event.target.value})}/><Button onClick={()=>{if(window.confirm(`Remove “${group.name}”? Habits will become ungrouped.`))onRemove(group.id)}}>Remove</Button></div>)}{!groups.length?<div className="empty-state">No groups yet.</div>:null}</div>
  </div></Drawer>
}
