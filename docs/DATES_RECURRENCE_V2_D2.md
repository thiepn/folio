# D2 — Dates, Scheduling & Recurrence Engine V2

D2 deepens Folio's date and recurrence semantics so repeating work behaves predictably across calendar boundaries, edits, devices, and time zones.

## Core principles

- `recurrenceDate` is the immutable logical identity of an occurrence.
- `plannedDate` is the date the user currently intends to do the work.
- Rescheduling one occurrence changes `plannedDate`; it never changes the logical slot.
- One-off edits are durable recurrence exceptions rather than invisible mutations.
- Calendar-based series are generated from deterministic date-only rules.
- Exact clock times are interpreted in the series IANA time zone.
- Completion-relative series are anchored to the actual completion instant in the series time zone.

## Rule families

### Daily

- every day;
- every N days;
- optional end date or occurrence count.

### Weekly

- one or more weekdays;
- every N weeks;
- interval anchoring uses Monday-first calendar weeks rather than rolling seven-day buckets.

### Monthly

- one or more dates of month;
- dates beyond a short month clamp to that month's final day;
- nth weekday, including 1st through 5th;
- last weekday;
- last day of month;
- every N months.

Examples:

- day 1 and 15 every month;
- day 31, clamped to February 28/29;
- second Tuesday;
- last Friday;
- last day of every third month.

### Yearly

- one or more selected months;
- one or more dates inside those months;
- every N years;
- month-end clamping remains deterministic.

### After completion

Completion-relative recurrence is no longer limited to days. It supports:

- N days after completion;
- N weeks after completion;
- N months after completion, with month-end clamping;
- N years after completion.

The completion date is evaluated in the series time zone, not whichever device happens to complete the task.

## Time-zone and DST semantics

Date-only recurrence slots do not depend on UTC offsets. Clock defaults such as 09:00 are converted from the series wall clock into an instant when a calendar block is materialized.

- DST fall-back overlaps choose the earlier matching instant deterministically.
- DST spring-forward gaps advance to the first valid local minute later that day.
- Calendar block duration is elapsed duration from the resolved start instant, so blocks can cross midnight.

## Occurrence exceptions

`RecurringSeriesEntity.exceptions[recurrenceDate]` can persist one-off:

- title and notes;
- project;
- priority and estimate;
- tags;
- checklist template;
- source URL;
- location;
- pin state;
- planned date;
- deadline;
- clock-block defaults;
- skipped state.

Explicitly clearing nullable fields is preserved rather than falling back to the series template.

## Edit scopes

### This occurrence

The task changes immediately and the same changes are recorded as a recurrence exception. Later edits to the series therefore do not silently erase the one-off customization.

### This and future

The series splits at the selected logical occurrence. The old series ends before the pivot; a new series begins at the pivot. Future exceptions move to the new series. Template fields explicitly changed by the split take precedence over matching pivot overrides.

### Entire series

The rule/template updates in place. Completed history remains untouched. Incomplete materialized occurrences are reconciled and missing future slots are generated.

## D1 task-template continuity

Recurring templates now carry the task context added in D1:

- tags;
- checklist text;
- source URL;
- location;
- pin state.

Each generated occurrence receives fresh checklist item IDs and independent completion state.

## Persistence and compatibility

- IndexedDB schema: **v17**;
- migration: **v16 → v17**;
- direct backup restore remains **v8–v17**;
- legacy `monthDay` remains readable;
- old series default to monthly `days` mode and completion unit `day`;
- structured Import v1 and Patch v1 accept the D2 rule/template shape;
- public JSON protocol schemas are kept aligned with runtime validation.

## Deliberate boundary

D2 does not implement reminder delivery. Dates and recurrence must be correct before alerts are layered on top. Reminder schedules, snooze, persistent alerts and notification actions belong to **D3 — Reminders & Notification Engine**.
