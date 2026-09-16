# Focus Engine Contract — Phase 10

## Purpose

Focus closes the core productivity loop:

```text
Plan task
   ↓
Start Focus
   ↓
Persistent session
   ↓
Finish / complete task
   ↓
Actual time
   ↓
Review + estimate calibration
```

Focus is deliberately an **execution state**, not a primary navigation section.

## Session model

A Focus session stores:

- optional Task reference;
- task-title snapshot;
- task-estimate snapshot;
- project ID/name snapshots;
- mode: `stopwatch | countdown`;
- optional countdown target;
- original start timestamp;
- accumulated active seconds;
- current resume timestamp while running;
- optional end timestamp;
- status: `running | paused | finished | cancelled`.

### Why accumulated seconds + resumedAt?

The app must not write IndexedDB every second.

For a running session:

```text
actual elapsed
=
stored durationSeconds
+
(now - resumedAt)
```

When paused or finished, the current elapsed value is folded back into `durationSeconds` and `resumedAt` is cleared.

This gives accurate restoration after:

- browser refresh;
- closing/reopening the PWA;
- mobile app switching;
- device sleep where JavaScript timers were suspended.

## Stopwatch

Stopwatch starts at zero and increases until the user pauses, finishes, or cancels.

Closing the Focus view does **not** pause the stopwatch. Leaving the visual layer is not the same action as pausing work.

## Countdown

Countdown has a positive `targetSeconds` value.

Display:

```text
target - elapsed
```

Elapsed time is capped at the target. This means a 25-minute countdown cannot silently become a 3-hour session merely because the browser was backgrounded.

If the target is reached while Focus is visible, the session transitions to Paused. On application boot, `reconcileActive()` performs the same correction if the target was reached while the app was closed.

## One active session

The normal Focus service prevents starting another session while a `running` or `paused` session exists.

This avoids ambiguous time attribution.

The persistence layer can still recover malformed/legacy data without crashing; `getActive()` selects the most recently updated active session.

## Task eligibility

Only an open `todo` Task may start Focus.

Not eligible:

- Inbox captures;
- completed Tasks;
- cancelled Tasks;
- deleted Tasks.

Historical sessions remain readable if their linked Task is later renamed, moved, archived, or deleted because snapshot metadata is stored on the session.

## Snapshot semantics

At session start:

```text
taskTitleSnapshot
taskEstimateMinutesSnapshot
projectIdSnapshot
projectNameSnapshot
```

are captured.

This is intentional.

If a task later moves from Analysis III to Personal, the old study session still counts toward Analysis III. Likewise, changing a task estimate after completing the work does not retroactively rewrite the estimate used for calibration.

## Pause / resume

Pause:

1. compute current elapsed;
2. persist elapsed to `durationSeconds`;
3. set status `paused`;
4. clear `resumedAt`.

Resume:

1. require paused state;
2. reject a countdown already at target;
3. set status `running`;
4. set `resumedAt = now`.

## Finish

Finishing a session:

- persists final elapsed;
- sets status `finished`;
- sets `endedAt`;
- clears `resumedAt`.

Finished sessions contribute to Review analytics.

## Finish + complete task

The Focus UI can compose:

```text
finish Focus session
+
complete Task
```

Task completion uses the normal Task service, so recurring completion-relative tasks still generate their next occurrence correctly.

The Task completion remains undoable; the Focus session remains historical actual work even if the task completion is reopened.

## Cancel

Cancelled sessions are retained with their elapsed duration but are excluded from normal Focus analytics.

This gives a non-destructive correction path for accidentally started or invalid sessions.

## Actual-time aggregation

Task actual time:

```text
sum(non-cancelled session durations for task)
```

While a session is active, its current effective elapsed time can be included in contextual task displays.

Review metrics intentionally use **finished sessions** for stable weekly/today totals.

## Estimate calibration

For completed tracked tasks:

```text
actual focused seconds
÷
estimate snapshot seconds
```

is aggregated to produce a concise calibration statement such as:

> Tasks took 14% longer than estimated.

This is intended to improve future planning, not create a productivity score.

## Project aggregation

Sessions use `projectIdSnapshot` for historical allocation.

Weekly Project Focus therefore does not change if a Task is moved between Projects after the work happened.

## UI rules

### Launcher

Shows:

- one Task selector;
- Stopwatch / Countdown choice;
- countdown presets;
- custom minutes;
- existing Focus already tracked on the Task;
- estimate-based remaining-time hint.

### Active Focus

Shows only:

- task title;
- project;
- mode/status;
- timer;
- countdown progress when applicable;
- Pause/Resume;
- Finish session;
- Finish + complete task;
- Cancel session.

No navigation, calendar, analytics dashboard, or unrelated task list is shown inside the execution surface.

### Recovery affordance

When a session exists:

- desktop Topbar: `Resume focus`;
- mobile Topbar: `Resume focus`.

Closing the Focus surface keeps the session alive.

## Phase boundary

Not included in Phase 10:

- website/app blocking;
- ambient sounds;
- notification alarms;
- Focus streak gamification;
- Pomodoro-specific persistence model;
- automatic break scheduling;
- manual time-entry editor;
- long-term trend charts.

Those features do not require changes to the core Focus session architecture if later justified.
