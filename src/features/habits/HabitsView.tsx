import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'
import { Panel } from '../../components/ui/Panel'
import { EmptyState } from '../../components/ui/EmptyState'
import type { HabitPreview } from '../../types/ui'

export function HabitsView({ habits, weeklyAdherence, dueToday, longestStreak, pausedCount = 0, onCreate, onArchived, onOpen, onToggle, onIncrement }: {
  habits: HabitPreview[]
  weeklyAdherence: number
  dueToday: number
  longestStreak: number
  pausedCount?: number
  onCreate: () => void
  onArchived: () => void
  onOpen: (id: string) => void
  onToggle: (id: string) => void
  onIncrement: (id: string, minutes: number) => void
}) {
  const active = habits.filter((habit) => !habit.paused)
  const attention = active.filter((habit) => (habit.weeklyPercent ?? 100) < 100).sort((a, b) => (a.weeklyPercent ?? 100) - (b.weeklyPercent ?? 100))
  const completeThisWeek = active.filter((habit) => (habit.weeklyPercent ?? 0) >= 100).length

  return (
    <>
      <PageHeader
        kicker="Rhythm over streaks"
        title="Habits"
        subtitle="Keep repeatable rhythms visible, let planned pauses stay neutral, and review the week without turning every day into a scorecard."
        action={<div className="page-action-row"><Button onClick={onArchived}>Archived</Button><Button variant="primary" onClick={onCreate}>New habit</Button></div>}
      />

      <div className="habit-summary-grid habit-summary-grid--v16">
        <div><strong>{dueToday}</strong><span>Due today</span></div>
        <div><strong>{weeklyAdherence}%</strong><span>Week adherence</span></div>
        <div><strong>{longestStreak}</strong><span>Longest current streak</span></div>
        <div><strong>{pausedCount}</strong><span>Paused now</span></div>
      </div>

      {habits.length ? <section className="habit-week-check">
        <div className="habit-week-check__head">
          <div><span className="eyebrow">Week check</span><h2>{attention.length ? `${attention.length} rhythm${attention.length === 1 ? '' : 's'} still in motion` : 'The week is on track'}</h2></div>
          <span>{completeThisWeek} complete · {pausedCount} paused</span>
        </div>
        {attention.length ? <div className="habit-week-check__list">
          {attention.slice(0, 6).map((habit) => <button key={habit.id} onClick={() => onOpen(habit.id)}>
            <div><strong>{habit.title}</strong><span>{habit.weeklyProgress} · {habit.scheduleLabel}</span></div>
            <div className="habit-week-check__progress"><i style={{ width: `${habit.weeklyPercent ?? 0}%` }} /><em>{habit.weeklyPercent ?? 0}%</em></div>
          </button>)}
        </div> : <div className="habit-week-check__clear">Every active habit has met its current weekly target. Paused periods are excluded rather than counted as misses.</div>}
      </section> : null}

      <Panel title="Current habits" meta={`${habits.length} active`}>
        {habits.length ? habits.map((habit) => (
          <div className={`habit-master-row ${habit.paused ? 'is-paused' : ''}`} key={habit.id}>
            <button
              className={`task-check ${habit.completed ? 'task-check--done' : ''} ${habit.skipped ? 'is-skipped' : ''}`}
              aria-label={habit.paused ? `${habit.title} is paused` : habit.completed ? `Reopen ${habit.title}` : `Complete ${habit.title}`}
              onClick={() => onToggle(habit.id)}
              disabled={habit.paused}
            />
            <button className="habit-master-row__body" onClick={() => onOpen(habit.id)}>
              <div className="habit-master-row__title"><strong>{habit.title}</strong>{habit.paused ? <em>Paused</em> : habit.flexible ? <em>Flexible</em> : null}</div>
              <span>{habit.paused ? habit.pauseLabel : `${habit.scheduleLabel} · ${habit.streak ?? 0} ${habit.scheduleLabel?.includes('per week') ? 'week' : 'completion'} streak`}</span>
            </button>
            <div className="habit-master-row__week"><strong>{habit.weeklyProgress}</strong><span>{habit.adherence4w}% / 4w</span></div>
            <div className="habit-master-row__actions">
              {habit.kind === 'duration' && !habit.paused && !habit.skipped && !habit.completed ? <button onClick={() => onIncrement(habit.id, 5)}>+5m</button> : null}
              <button onClick={() => onOpen(habit.id)}>Details</button>
            </div>
          </div>
        )) : <EmptyState title="No habits yet" body="Track only routines where repeated visibility changes your behavior. Avoid turning one-off tasks into habits." action={<Button variant="primary" onClick={onCreate}>Create first habit</Button>} />}
      </Panel>
    </>
  )
}
