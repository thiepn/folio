import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'
import { Panel } from '../../components/ui/Panel'
import { EmptyState } from '../../components/ui/EmptyState'
import type { HabitGroupEntity } from '../../domain/models'
import type { HabitPreview } from '../../types/ui'

function HabitRow({ habit, onOpen, onToggle, onIncrement }: { habit: HabitPreview; onOpen:(id:string)=>void; onToggle:(id:string)=>void; onIncrement:(id:string,value:number)=>void }) {
  const increment = habit.kind === 'duration' ? 5 : 1
  const incrementLabel = habit.kind === 'duration' ? '+5m' : `+1 ${habit.unit ?? ''}`.trim()
  return <div className={`habit-master-row ${habit.paused ? 'is-paused' : ''}`} key={habit.id} style={{'--habit-color':habit.color??'var(--accent)'} as React.CSSProperties}>
    <button className={`task-check ${habit.completed ? 'task-check--done' : ''} ${habit.skipped ? 'is-skipped' : ''}`} aria-label={habit.paused ? `${habit.title} is paused` : habit.completed ? `Reopen ${habit.title}` : `Complete ${habit.title}`} onClick={() => onToggle(habit.id)} disabled={habit.paused} />
    <button className="habit-master-row__body" onClick={() => onOpen(habit.id)}>
      <div className="habit-master-row__title"><i className="habit-color-dot"/><strong>{habit.title}</strong>{habit.paused ? <em>Paused</em> : habit.flexible ? <em>Flexible</em> : null}</div>
      <span>{habit.paused ? habit.pauseLabel : `${habit.scheduleLabel} · ${habit.streak ?? 0} ${habit.periodLabel === 'month' ? 'month' : habit.scheduleLabel?.includes('per week') ? 'week' : 'completion'} streak`}</span>
    </button>
    <div className="habit-master-row__week"><strong>{habit.periodProgress ?? habit.weeklyProgress}</strong><span>{habit.adherence90}% / 90d</span></div>
    <div className="habit-master-row__actions">{habit.kind !== 'check' && !habit.paused && !habit.skipped && !habit.completed ? <button onClick={() => onIncrement(habit.id, increment)}>{incrementLabel}</button> : null}<button onClick={() => onOpen(habit.id)}>Details</button></div>
  </div>
}

export function HabitsView({ habits, groups, weeklyAdherence, dueToday, longestStreak, pausedCount = 0, onCreate, onArchived, onGroups, onTemplates, onOpen, onToggle, onIncrement }: {
  habits: HabitPreview[]
  groups: HabitGroupEntity[]
  weeklyAdherence: number
  dueToday: number
  longestStreak: number
  pausedCount?: number
  onCreate: () => void
  onArchived: () => void
  onGroups: () => void
  onTemplates: () => void
  onOpen: (id: string) => void
  onToggle: (id: string) => void
  onIncrement: (id: string, value: number) => void
}) {
  const active = habits.filter((habit) => !habit.paused)
  const attention = active.filter((habit) => (habit.periodPercent ?? 100) < 100).sort((a, b) => (a.periodPercent ?? 100) - (b.periodPercent ?? 100))
  const completeThisPeriod = active.filter((habit) => (habit.periodPercent ?? 0) >= 100).length
  const grouped = groups.map((group)=>({group,habits:habits.filter((habit)=>habit.groupId===group.id)})).filter((row)=>row.habits.length)
  const ungrouped = habits.filter((habit)=>!habit.groupId || !groups.some((group)=>group.id===habit.groupId))

  return <>
    <PageHeader kicker="Rhythm over streaks" title="Habits" subtitle="Build measurable rhythms with flexible frequency goals, editable history, neutral pauses, and evidence you can review over time."
      action={<div className="page-action-row"><Button onClick={onGroups}>Groups</Button><Button onClick={onTemplates}>Templates</Button><Button onClick={onArchived}>Archived</Button><Button variant="primary" onClick={onCreate}>New habit</Button></div>} />

    <div className="habit-summary-grid habit-summary-grid--v16">
      <div><strong>{dueToday}</strong><span>Due today</span></div><div><strong>{weeklyAdherence}%</strong><span>Week adherence</span></div><div><strong>{longestStreak}</strong><span>Longest current streak</span></div><div><strong>{pausedCount}</strong><span>Paused now</span></div>
    </div>

    {habits.length ? <section className="habit-week-check"><div className="habit-week-check__head"><div><span className="eyebrow">Period check</span><h2>{attention.length ? `${attention.length} rhythm${attention.length === 1 ? '' : 's'} still in motion` : 'Current targets are on track'}</h2></div><span>{completeThisPeriod} target-complete · {pausedCount} paused</span></div>
      {attention.length ? <div className="habit-week-check__list">{attention.slice(0, 6).map((habit) => <button key={habit.id} onClick={() => onOpen(habit.id)}><div><strong>{habit.title}</strong><span>{habit.periodProgress} · {habit.scheduleLabel}</span></div><div className="habit-week-check__progress"><i style={{ width: `${habit.periodPercent ?? 0}%` }} /><em>{habit.periodPercent ?? 0}%</em></div></button>)}</div> : <div className="habit-week-check__clear">Every active habit has met its current weekly or monthly frequency target. Pauses and rest days remain neutral.</div>}
    </section> : null}

    {!habits.length ? <Panel title="Current habits" meta="0 active"><EmptyState title="No habits yet" body="Use habits for behavior you intend to repeat. Quantity, duration, weekly frequency, and monthly frequency are all supported." action={<Button variant="primary" onClick={onCreate}>Create first habit</Button>} /></Panel> : <>
      {grouped.map(({group,habits:rows})=><Panel key={group.id} title={group.name} meta={`${rows.length} habit${rows.length===1?'':'s'}`}><div className="habit-group-accent" style={{background:group.color??'var(--accent)'}}/>{rows.map((habit)=><HabitRow key={habit.id} habit={habit} onOpen={onOpen} onToggle={onToggle} onIncrement={onIncrement}/>)}</Panel>)}
      {ungrouped.length ? <Panel title={groups.length ? 'Ungrouped' : 'Current habits'} meta={`${ungrouped.length} active`}>{ungrouped.map((habit)=><HabitRow key={habit.id} habit={habit} onOpen={onOpen} onToggle={onToggle} onIncrement={onIncrement}/>)}</Panel> : null}
    </>}
  </>
}
