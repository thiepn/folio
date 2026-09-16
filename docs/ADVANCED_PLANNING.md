# Advanced Planning Contract — Phase 19

## Core principle

Advanced planning must answer three distinct questions without conflating them:

1. **Urgency** — when is the hard boundary?
2. **Readiness** — can this work actually be executed now?
3. **Capacity** — is there enough realistic workload room to do it?

Priority remains a user-supplied importance signal. None of these dimensions is converted into an opaque productivity score.

## Dependencies

### Meaning

`A.blockedByTaskIds = [B]` means:

> B must be completed before A is ready for execution.

The dependency does not automatically schedule either Task and does not imply Project membership.

### Active blocker

A referenced Task blocks while it is not deleted/cancelled and not completed.

A completed prerequisite remains in the relationship as satisfied history.

### Graph constraints

- top-level Task → top-level Task only;
- no self-edge;
- no cycles;
- no Inbox endpoints;
- no automatic dependency inheritance on duplicate;
- recurring occurrence dependencies are occurrence-local.

### Execution behavior

Blocked Tasks remain visible in planning and deadline views. They may still be edited/rescheduled. Focus refuses to start until the prerequisites are satisfied.

This is intentional: planning must be able to see blocked work even though execution cannot begin.

## Six-week forecast

The forecast horizon begins on Today and covers 42 local calendar days.

### Workload sources

Included:

- open root Tasks with `plannedDate` and `estimatedMinutes`;
- fixed-schedule duration Habits that count toward capacity.

Excluded from day workload:

- Inbox captures;
- completed/cancelled/deleted Tasks;
- unplanned Tasks;
- flexible N-times-per-week Habits that have not been committed to a specific date.

### Capacity

For each date:

1. use `DailyPlan.capacityMinutes` when explicitly overridden;
2. otherwise use the global daily-capacity Setting.

The forecast reports overload but never resolves it automatically.

## Deadline pressure

Deadline pressure considers open root Tasks with a hard deadline in the next 30 days or already overdue.

A Task can therefore be:

```text
urgent + ready
urgent + blocked
not urgent + ready
not urgent + blocked
```

Blocked Tasks close to their hard boundary receive stronger attention because prerequisite work must also be resolved.

## Project planning

Project planning summaries are live derived views over Tasks.

### Standard Project

Shows:

- open work;
- unplanned work;
- blocked work;
- estimated backlog;
- next deadline;
- due-next-30 count.

### Academic Project

Adds:

- exam date;
- weeks remaining;
- estimated backlog minutes per remaining week;
- configured weekly study target.

`backlog/week to exam` is a planning estimate, not a prediction that all study effort has been captured perfectly in Tasks.

## Saved views

Saved views store filters, not Task memberships.

A matching result is recalculated from current Task data whenever the view is opened. Therefore:

- completing a Task changes relevant saved-view results automatically;
- moving a Task can remove/add it to a date-filtered view;
- resolving a prerequisite can move it from Blocked to Ready;
- deleting a saved view never affects Tasks.

Built-in views are immutable application perspectives. User views are limited to 12 to avoid creating a second task-organization database.

## Mobile / tablet

Forecast remains readable on narrow layouts:

- score band wraps;
- weekly forecast rows stay vertical;
- Project planning rows collapse into readable groups;
- Saved View perspective selector becomes horizontally scrollable/stacked;
- task results retain Phase 17 touch behavior.

No advanced planning interaction requires hover, drag, or a hardware keyboard.
