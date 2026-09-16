# Habit Engine Contract — Phase 11

## Product boundary

A Habit models repeated behavior, not an obligation.

A Habit therefore owns:

- title / description;
- tracking kind;
- per-occurrence target;
- schedule;
- optional daily-capacity behavior;
- archive state;
- dated progress history.

It deliberately does **not** own:

- project assignment;
- priority;
- deadline;
- subtasks;
- Task recurrence series;
- Task planned date;
- Task status.

## Tracking kinds

### Check

One completion is sufficient for the date.

```text
Bible reading  ✓
```

Target is normalized to `1`.

### Duration

Progress is measured in minutes.

```text
French
15 / 30 min
```

Progress is capped at the target because Focus Sessions—not Habit progress—are the system for measuring extra actual work time.

## Schedule types

### Daily

Scheduled every calendar day.

### Weekdays

Scheduled Monday through Friday.

### Selected weekdays

Explicit weekday set, e.g. Monday / Wednesday / Friday.

### Times per week

A flexible weekly frequency, e.g. `3× per week`.

This schedule has no canonical day. The app therefore does not invent Monday/Wednesday/Friday. It appears as flexible work while the weekly target is incomplete. It does not reserve daily capacity until a progress entry exists for the current day.

## HabitEntry states

A dated entry has:

```text
open
completed
skipped
```

No entry is equivalent to open/unrecorded for a scheduled date.

### Completed

Counts toward adherence and streaks.

### Skipped / Rest

Represents a deliberate rest day.

A rest day:

- contributes zero capacity;
- does not count as completed;
- does not break a fixed-schedule streak;
- is removed from the adherence denominator.

### Missed

A scheduled date in the past with neither completion nor rest is a miss.

For fixed schedules, a miss breaks the current streak.

## Streak semantics

### Fixed-day habits

The streak counts consecutive **scheduled completions**, not raw calendar days.

Example:

```text
Mon  completed
Tue  not scheduled
Wed  rest
Fri  completed
```

The streak is 2 completed scheduled occurrences. Wednesday is neutral.

An incomplete current day does not break the streak until the day is over.

### Flexible weekly habits

Streaks are weekly.

For `3× per week`, a week contributes one streak unit when the weekly target is met.

The current week does not break the prior streak while it is still in progress.

## First partial week

A flexible habit created mid-week receives a proportional first-week target rather than being immediately judged against a full seven-day week.

## Adherence

Fixed schedules:

```text
completed scheduled dates
─────────────────────────
scheduled dates - rests
```

Flexible schedules use weekly targets.

The top-level Week adherence metric is pace-aware for the current week so a `3× per week` habit is not considered behind on Monday merely because all three sessions are still future-capable.

## Daily capacity

Only Duration habits may reserve capacity.

For a fixed scheduled Duration habit:

```text
capacity contribution
=
target - current progress
```

A completed or skipped habit contributes zero.

For flexible N-times-per-week habits, the habit contributes zero until the user begins logging it on that specific day. This avoids pretending a flexible weekly goal has already been assigned to every day.

## Undo behavior

These Habit operations return the shared `UndoableMutation` contract:

- create;
- edit;
- archive;
- restore;
- complete/reopen;
- duration progress;
- skip/rest;
- undo rest.

Entries are restored from exact previous snapshots rather than inferred inverse operations.

## History

Habit history is stored as dated `HabitEntryEntity` rows and survives archive/restore.

The current detail view exposes:

- current streak;
- this-week progress;
- four-week adherence;
- 28-day visual history.

The Habit definition remains lightweight; Phase 11 does not introduce a second analytics warehouse.
