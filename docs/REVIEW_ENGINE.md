# Review Engine Contract — Phase 12

## Purpose

Review is the corrective end of the product loop:

```text
Capture → Plan → Schedule → Execute → Habits → Review
                                      ↑          │
                                      └──────────┘
```

It should answer three questions:

1. What actually happened this week?
2. Where was the plan unrealistic or neglected?
3. What concrete changes deserve attention before planning the next week?

## Source-of-truth policy

Review stores no duplicate analytics records. It derives from:

- `TaskEntity`
- `DailyPlanEntity`
- `TimeBlockEntity`
- `FocusSessionEntity`
- `HabitEntity` / `HabitEntryEntity`
- `ProjectEntity`

Therefore schema stays **v8**.

## Core metrics

### Planned task completion

Uses root Tasks currently planned from Monday through Today.

```text
completed planned tasks
÷
all planned tasks through today
```

This is deliberately described as *planned-through-today completion*, not immutable historical plan fidelity, because moving a task updates its current planned date.

### Daily overload

For each elapsed day in the current Monday-first week:

```text
task estimates
+ committed duration-habit target
vs
DailyPlan capacity override or global capacity
```

Skipped/rest habits contribute zero.

Flexible weekly habits contribute only on days where an entry exists; Review never invents weekdays for them.

### Scheduled vs actual

Scheduled time includes Task-kind `TimeBlock`s only.

Standalone events such as lectures/lunch are excluded.

Actual execution includes finished Focus Sessions only.

Cancelled sessions do not count.

### Estimate calibration

Uses completed Tasks that have tracked Focus time and an estimate. Historical Focus-session estimate snapshots take precedence over later Task estimate edits.

### Postponement

An open Task enters the signal set when:

```text
rescheduleCount >= 2
```

### Stale backlog

Default threshold:

```text
14 days open
```

Excluded:

- deleted Tasks;
- completed/cancelled Tasks;
- future-planned Tasks;
- materialized recurring occurrences (`seriesId`) so a recurrence horizon does not create false stale warnings.

### Academic pace

For academic Projects with `weeklyTargetMinutes`, Review compares current Focus to the week-to-date expected pace.

Result:

```text
ahead
on-track
behind
```

It does not call a course “behind” merely because the full weekly target is not finished on Monday.

### Neglected projects

An active Project is considered neglected when it has open Tasks but this week has:

```text
0 Focus seconds
0 completed Tasks
```

This is an attention signal, not a quality judgment.

## Recommendation rules

Recommendations are deterministic and explainable.

Examples:

- overdue deadlines → resolve before discretionary work;
- overloaded days → reduce commitments / correct capacity;
- repeated postponement → do, redefine, deliberately defer or remove;
- stale backlog → re-justify old work;
- large scheduled-vs-Focus gap → time-block less aggressively or track Focus consistently;
- academic projects below pace → protect study blocks;
- high completion with no overload → positive confirmation that planning was realistic.

Review never automatically performs these changes.

## Guided Weekly Review

The workflow has four steps.

### 1. Carryover

Unfinished work planned before today receives explicit actions:

```text
Today
Tomorrow
Later
Inspect
```

### 2. Friction

Union of stale and repeatedly postponed work.

Actions:

```text
Inspect
Tomorrow
Later
Trash
```

All mutations use existing undoable services.

### 3. Deadlines

Shows:

- overdue hard deadlines;
- hard deadlines in the next Monday–Sunday week.

### 4. Next week

Summarizes:

- next-week deadline count;
- academic projects below pace;
- neglected projects;
- current corrective recommendations.

The final action opens Planner. The Review engine does not auto-schedule next week.

## UX principles

- Review is textual/editorial first; charts are subordinate.
- Every warning should explain the behavior that produced it.
- Problems should link back to underlying Tasks.
- Healthy behavior should be acknowledged without gamification.
- Statistics should remain sparse enough to answer decisions within seconds.
