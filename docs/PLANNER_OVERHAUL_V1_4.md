# Folio v1.4 — Planner Overhaul

Folio v1.4 turns Planner into a single coherent planning workspace instead of a set of partially overlapping views.

## Core semantic rule

Folio keeps two task dates deliberately separate:

- **Planned date** = when the user intends to work on the task.
- **Deadline** = when the task must be finished.

Dragging, keyboard rescheduling, backlog planning, week balancing, and month placement change only the planned date. A deadline is changed only from task editing.

## Planner modes

### Agenda

Chronological planned work, overdue carryover, due-but-unplanned work, and Later/backlog. Every task shows Planned and Deadline as separate metadata.

### Day

A workload view for any selected date with:

- planned work minutes,
- capacity and remaining/over-capacity state,
- due-task count,
- editable per-day capacity,
- planned tasks,
- a separate deadline lane for work due that day but planned elsewhere,
- capacity-counting habits,
- unscheduled backlog,
- direct handoff into exact-time Calendar scheduling.

### Week

A Monday–Sunday planning surface with:

- per-day capacity and load,
- drag-to-reschedule between days,
- a persistent unscheduled backlog,
- due-but-unplanned tasks surfaced as explicit weekly planning decisions,
- suggested placement before deadlines,
- existing overload balancing suggestions,
- separate due indicators,
- per-day capacity editing.

### Month

A 42-day Monday-first grid that shows:

- planned workload,
- capacity pressure,
- planned task count,
- due-task count,
- representative task titles,
- drag-to-date planning,
- unscheduled backlog,
- click-through into Day.

### Calendar

The existing exact-time scheduler remains authoritative for clock time. v1.4 links Planner's selected date into Calendar so moving between Day/Month and Calendar preserves context.

### Forecast

The existing longer-range forecast and saved-view system remains intact.

## Keyboard planning

Planner task cards support:

- **Shift + Left Arrow** — move planned work one day earlier.
- **Shift + Right Arrow** — move planned work one day later.
- **Shift + Backspace** — return the task to Later/unplanned.

These commands never modify the deadline.

## Persistence and compatibility

v1.4 introduces **no database migration**. IndexedDB remains schema **v13**. The overhaul composes existing canonical fields and services:

- `TaskEntity.plannedDate`
- `TaskEntity.deadline`
- Daily Plan capacity and buckets
- Time Blocks
- Habits that count toward capacity
- Saved views and forecasting

Existing v1.3 data and v8–v13 backups remain compatible.
