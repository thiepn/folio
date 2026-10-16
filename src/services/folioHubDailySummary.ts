import { db } from '../db/database';
import { localDateKey } from '../domain/date';

export const FOLIO_HUB_DEVICE_MESSAGE = 'thiepn:folio-hub-daily:v1' as const;
export interface FolioHubDailySummary {
  schema: 'thiepn:folio-hub-daily';
  version: 1;
  generatedAt: string;
  date: string;
  source: 'folio-local-device';
  tasks: { id: string; title: string; plannedDate?: string; deadline?: string; priority: string; plannedToday: boolean }[];
  pendingCount: number;
  overdueCount: number;
  events: { id: string; title: string; start: string; end: string; kind: 'task' | 'event'; allDay: boolean }[];
  notes: { id: string; title: string; updatedAt: string }[];
  habits: { id: string; title: string; target: number; value: number; status: 'open' | 'completed' | 'skipped' }[];
}

/** Folio is the sole authority: never use the Hub's model, stores or grading.
 * The service is invoked only after the person explicitly approves one handoff. */
export async function createFolioHubDailySummary(now = new Date()): Promise<FolioHubDailySummary> {
  const today = localDateKey(now);
  const [tasks, planned, blocks, notes, habits, entries] = await db.transaction('r',
    db.tasks, db.dailyPlanItems, db.timeBlocks, db.notes, db.habits, db.habitEntries,
    async () => Promise.all([
      db.tasks.toArray(), db.dailyPlanItems.where('date').equals(today).toArray(),
      db.timeBlocks.toArray(), db.notes.toArray(), db.habits.toArray(),
      db.habitEntries.where('date').equals(today).toArray(),
    ]),
  );
  const plannedIds = new Set(planned.map(item => item.taskId));
  const relevant = tasks.filter(task => !task.deletedAt && (task.status === 'todo' || task.status === 'inbox'))
    .filter(task => plannedIds.has(task.id) || task.plannedDate === today || !!(task.deadline && task.deadline <= today))
    .sort((a, b) => {
      const weight = (task: typeof a) => task.deadline && task.deadline < today ? 0 : task.priority === 'critical' ? 1 : task.priority === 'high' ? 2 : 3;
      return weight(a) - weight(b) || a.title.localeCompare(b.title);
    });
  const upcoming = blocks.filter(block => !Number.isNaN(Date.parse(block.start)) &&
    !Number.isNaN(Date.parse(block.end)) && Date.parse(block.end) > now.getTime() - 24 * 60 * 60_000 &&
    localDateKey(new Date(block.start)) <= localDateKey(new Date(now.getTime() + 7 * 86400_000)))
    .sort((a, b) => a.start.localeCompare(b.start)).slice(0, 12);
  const entryByHabit = new Map(entries.map(entry => [entry.habitId, entry]));
  const summary: FolioHubDailySummary = {
    schema: 'thiepn:folio-hub-daily', version: 1, generatedAt: now.toISOString(), date: today,
    source: 'folio-local-device',
    tasks: relevant.slice(0, 12).map(task => ({
      id: task.id, title: task.title.slice(0, 200),
      ...(task.plannedDate ? { plannedDate: task.plannedDate } : {}),
      ...(task.deadline ? { deadline: task.deadline } : {}),
      priority: task.priority, plannedToday: plannedIds.has(task.id) || task.plannedDate === today,
    })),
    pendingCount: relevant.length,
    overdueCount: relevant.filter(task => task.deadline && task.deadline < today).length,
    events: upcoming.map(block => ({
      id: block.id, title: block.title.slice(0, 200), start: block.start, end: block.end,
      kind: block.kind, allDay: !!block.allDay,
    })),
    notes: notes.filter(note => !note.archived).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 5).map(note => ({ id: note.id, title: note.title.slice(0, 200), updatedAt: note.updatedAt })),
    habits: habits.filter(habit => !habit.archived).sort((a, b) => a.sortOrder - b.sortOrder)
      .slice(0, 10).map(habit => ({
        id: habit.id, title: habit.title.slice(0, 200), target: habit.target,
        value: entryByHabit.get(habit.id)?.value ?? 0,
        status: entryByHabit.get(habit.id)?.status ?? 'open',
      })),
  };
  // Prevent an unexpected oversized local state from leaving Folio.
  if (JSON.stringify(summary).length > 48_000) throw new Error('Folio summary is too large to share.');
  return summary;
}
