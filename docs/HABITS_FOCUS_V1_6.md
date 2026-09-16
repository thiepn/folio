# Folio v1.6 — Habits & Focus refinement

## Objective

Strengthen two existing execution systems without turning Folio into a dedicated habit tracker or pomodoro application.

The release makes habit breaks explicit and historically neutral, and makes Focus sessions more intentional while retaining the existing local-first task/project linkage.

## Habits

### Durable pause intervals

A Habit now owns a `pauses` history. Each pause has a start date and either an end date or remains open until explicitly resumed.

Paused dates:

- are not due dates;
- do not reserve daily capacity;
- do not count as misses;
- do not break fixed-day or flexible weekly streaks;
- are excluded from adherence denominators;
- remain visible as neutral history after the Habit is resumed.

`Skip today` remains a one-day exception. Pause is for a real break in the rhythm.

### Weekly review

The Habits screen now shows a compact week check alongside due count, adherence, longest current streak, and paused count. Active Habits that have not reached the current week's target are surfaced without treating pauses as failure.

### Deeper history

Habit detail expands to eight weeks of daily state plus an eight-week weekly trend. Complete, skipped/rest, paused, missed and off days are visually distinct.

## Focus

### Ready-work ranking

The Focus launcher ranks only ready tasks. Planned-today/carryover work, hard deadlines, planning bucket and task priority contribute to the suggestion. Tasks with unresolved blockers are not offered as ready Focus work.

The suggestion is explanatory rather than automatic: the user can select any ready task.

### Session intention

A Focus session can capture a short intention before it starts. This is stored with the session snapshot so the historical record preserves what the session was meant to accomplish.

### Planned duration without forcing a timer

Countdown remains an enforced target. Stopwatch/Open Focus now supports an optional planned duration that acts as a visible boundary only; reaching it does not pause or end the session.

### Finish note

A session can capture a short note before Finish or Finish + complete task. The note is stored with the finished session and becomes searchable historical context.

### Launcher context

The launcher shows today's focused time, this week's focused time, session count, previous time tracked on the selected task, estimate remaining, and recent finished sessions.

## Persistence

v1.6 advances IndexedDB to schema **v15**.

The v14 → v15 migration only backfills `HabitEntity.pauses = []` for existing Habits. New Focus context fields are optional and therefore require no row rewrite.

Full backups advance to schema v15 and direct restore continues to accept v8–v15 backups. Older backups receive empty pause histories and optional Focus context remains absent until new sessions are created.

## Non-goals

v1.6 does not add social habit accountability, gamification, badges, rigid streak punishment, ambient sounds, website blocking, pomodoro cycles, or a second task-completion system.
