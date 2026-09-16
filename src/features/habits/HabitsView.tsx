import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'
import { Panel } from '../../components/ui/Panel'
import { EmptyState } from '../../components/ui/EmptyState'
import type { HabitPreview } from '../../types/ui'

export function HabitsView({ habits, weeklyAdherence, dueToday, longestStreak, onCreate, onArchived, onOpen, onToggle, onIncrement }: {
  habits: HabitPreview[]
  weeklyAdherence: number
  dueToday: number
  longestStreak: number
  onCreate: () => void
  onArchived: () => void
  onOpen: (id: string) => void
  onToggle: (id: string) => void
  onIncrement: (id: string, minutes: number) => void
}) {
  return (
    <>
      <PageHeader
        kicker="Rhythm over streaks"
        title="Habits"
        subtitle="Support repeatable rhythms without turning every day into a scorecard. Rest stays neutral."
        action={<div className="page-action-row"><Button onClick={onArchived}>Archived</Button><Button variant="primary" onClick={onCreate}>New habit</Button></div>}
      />

      <div className="habit-summary-grid">
        <div><strong>{dueToday}</strong><span>Due today</span></div>
        <div><strong>{weeklyAdherence}%</strong><span>Week adherence</span></div>
        <div><strong>{longestStreak}</strong><span>Longest current streak</span></div>
      </div>

      <Panel title="Current habits" meta={`${habits.length} active`}>
        {habits.length ? habits.map((habit) => (
          <div className="habit-master-row" key={habit.id}>
            <button className={`task-check ${habit.completed ? 'task-check--done' : ''} ${habit.skipped ? 'is-skipped' : ''}`} aria-label={habit.completed ? `Reopen ${habit.title}` : `Complete ${habit.title}`} onClick={() => onToggle(habit.id)} />
            <button className="habit-master-row__body" onClick={() => onOpen(habit.id)}>
              <strong>{habit.title}</strong>
              <span>{habit.scheduleLabel} · {habit.streak ?? 0} {habit.scheduleLabel?.includes('per week') ? 'week' : 'completion'} streak</span>
            </button>
            <div className="habit-master-row__week"><strong>{habit.weeklyProgress}</strong><span>{habit.adherence4w}% / 4w</span></div>
            <div className="habit-master-row__actions">
              {habit.kind === 'duration' && !habit.skipped && !habit.completed ? <button onClick={() => onIncrement(habit.id, 5)}>+5m</button> : null}
              <button onClick={() => onOpen(habit.id)}>Details</button>
            </div>
          </div>
        )) : <EmptyState title="No habits yet" body="Track only routines where repeated visibility changes your behavior. Avoid turning one-off tasks into habits." action={<Button variant="primary" onClick={onCreate}>Create first habit</Button>} />}
      </Panel>
    </>
  )
}
