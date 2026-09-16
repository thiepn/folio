import { Button } from '../../components/ui/Button'
import { Drawer } from '../../components/ui/Drawer'
import { habitScheduleLabel } from '../../domain/habit'
import type { HabitEntity } from '../../domain/models'

export function ArchivedHabitsDrawer({ open, habits, onClose, onRestore }: { open: boolean; habits: HabitEntity[]; onClose: () => void; onRestore: (id: string) => void }) {
  return <Drawer open={open} title="Archived habits" onClose={onClose}><div className="archive-project-list">{habits.length ? habits.map((habit) => <div className="archive-project-row" key={habit.id}><span className="habit-archive-mark">○</span><div><strong>{habit.title}</strong><span>{habitScheduleLabel(habit)}</span></div><Button onClick={() => onRestore(habit.id)}>Restore</Button></div>) : <div className="empty-state">No archived habits.</div>}</div></Drawer>
}
