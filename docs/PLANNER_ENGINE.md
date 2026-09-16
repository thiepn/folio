# Multi-Day Planner Engine Contract

## Date semantics

The planner preserves the established distinction:

- `Task.plannedDate` — the day the user intends to work on it
- `Task.deadline` — the hard latest completion date
- `TimeBlock.start/end` — exact clock-time reservation, handled in Phase 8

## Planner modes

### Upcoming

Rolling chronological planning. It is not bound to calendar-week boundaries.

### Week

Monday–Sunday workload balancing. It is not an exact-time calendar.

## Day workload

For a date `d`:

```
open task estimates on d
+ unfinished duration habits scheduled on d
= planned workload
```

Completed tasks contribute zero remaining workload.

## Capacity

```
day capacity = DailyPlan.capacityMinutes ?? global daily capacity
remaining = capacity - planned workload
```

Negative remaining capacity means the day is overloaded.

## Moving tasks

A move to another date is a semantic planning operation, not just a Task patch.

The operation must keep Task and Daily Plan data synchronized and must be reversible as one Undo action.

## Balance suggestions

Suggestions are advisory only.

The engine may recommend one move when it can identify a clearly safer alternative day. It must not silently optimize, reorder or reschedule the user's week.

## Week boundaries

Phase 7 uses Monday as the first day of the week. A user-configurable first weekday can be introduced later if genuinely needed without changing persistence.
