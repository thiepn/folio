# Recurrence & Series Engine — Phase 9 Contract

## Core model

A recurring responsibility is represented by one `RecurringSeriesEntity` plus materialized `TaskEntity` occurrences.

- `RecurringSeriesEntity` owns the repeat rule and future defaults.
- `TaskEntity.seriesId` links an occurrence to the series.
- `TaskEntity.recurrenceDate` is the immutable logical occurrence key.
- `TaskEntity.plannedDate` remains editable and may diverge from `recurrenceDate` for a one-off reschedule.
- `TimeBlockEntity` stays separate and can be generated from series clock defaults.

This means existing Today, Planner, Project, Calendar, Review and backup systems continue to work with ordinary tasks rather than virtual recurrence objects.

## Rule families

### Calendar recurrence

Supported:

- daily;
- every N days;
- weekly;
- selected weekdays;
- every N weeks;
- monthly with month-end clamping;
- yearly;
- optional `until` boundary;
- optional occurrence `count` boundary.

Calendar recurrence is materialized ahead on a rolling horizon (120 days by default).

### Completion-relative recurrence

`after-completion` does not pre-generate future dates.

Example:

> Replace filter every 30 days after completion.

The next occurrence is created only after the current occurrence is actually completed. This avoids deadline drift caused by assuming the user completed the task on its planned date.

## Occurrence identity

`recurrenceDate` identifies the logical slot in a series. Moving an occurrence from Thursday to Saturday changes `plannedDate`, not `recurrenceDate`.

Therefore the generator can see that Thursday's logical occurrence already exists and will not recreate it.

## Exceptions

`RecurringSeriesEntity.exceptions` stores per-date exceptions keyed by `recurrenceDate`.

Phase 9 uses this primarily for skipped occurrences. The structure also supports future per-occurrence overrides for title, project, priority, estimate, planned date, deadline and calendar-block defaults.

## Edit scopes

### This occurrence

Normal Task editing. The series definition is untouched.

### This and future

The series is split at the selected occurrence:

1. previous series ends the day before the pivot occurrence;
2. a new series begins at the pivot occurrence;
3. already-materialized future tasks are reassigned to the new series;
4. changed template fields are propagated without destroying unrelated per-occurrence edits;
5. missing future occurrences are materialized under the new rule.

### Entire series

The series definition is updated in place. Incomplete materialized occurrences are reconciled against the new rule and changed template fields. Completed history is preserved.

## Pause / resume / end

Because occurrences are materialized ahead, pausing cannot merely stop future generation; already-materialized future occurrences would otherwise continue appearing.

- Pause: future incomplete occurrences become `cancelled` and disappear from normal task/calendar surfaces.
- Resume: eligible cancelled occurrences are restored and the forward horizon is materialized again.
- End: series becomes `archived`; future incomplete occurrences are cancelled.

All three actions are undoable.

## Skip occurrence

Skipping:

- records `exceptions[recurrenceDate].skip = true`;
- changes the occurrence to `cancelled`;
- removes linked time blocks;
- preserves the occurrence in storage so the generator does not recreate it.

## Quick Add grammar

Supported recurrence syntax is intentionally explicit:

- `*` → daily;
- `every day`;
- `every 2 days`;
- `every weekday`;
- `every monday`;
- `every mon,wed,fri`;
- `every 2 weeks`;
- `every month`;
- `every year`;
- `after:7d` → seven days after completion;
- `until:2026-12-31` → end boundary;
- `x10` → ten occurrences.

The parser does not attempt unrestricted recurrence English. Complex natural-language schedules remain a responsibility of the later ChatGPT import protocol.

## Time blocks

A series may define:

- `startMinute`;
- `blockDurationMinutes`.

Materialized occurrences then receive linked Task Time Blocks. Changing series time defaults reconciles future occurrence blocks.

## Materialization

`recurrenceService.materializeAll()` runs during database initialization. This lets a static local-first PWA replenish its forward recurrence horizon whenever the application opens without a server or background scheduler.

## Safety invariants

1. Completed historical occurrences are never rewritten by ordinary series updates.
2. A moved occurrence is not regenerated at its original date.
3. Cancelled/skipped occurrences do not appear in normal task or calendar queries.
4. A completion-relative series creates at most one next occurrence for a completed task.
5. Editing a one-off occurrence does not mutate the series unless a series scope is explicitly selected.
6. Series mutations return undoable operations.
