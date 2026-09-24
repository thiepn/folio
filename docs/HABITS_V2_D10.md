# D10 — Habits V2

D10 deepens Folio's habit engine without turning Habits into a separate application.

## Shipped

- Three tracking modes: check, quantity, and duration.
- Fixed schedules plus flexible weekly and monthly frequency goals.
- Quantity units, color identity, optional grouping, and duration-to-capacity behavior.
- Neutral pause periods and intentional rest days.
- Current streak, best streak, period progress, 4-week/90-day adherence, lifetime completions and accumulated value.
- Twelve-week adherence trend and selectable twelve-week heatmap.
- Historical correction: set a past value, mark complete, mark a rest day, or clear an entry.
- Habit groups that organize the Habits surface without owning or deleting member habits.
- Built-in and user-created habit templates; templates copy definitions only and never copy progress/history.
- Flexible-habit reminder prompt days that do not change the underlying weekly/monthly goal.
- Structured import/patch support for quantity and monthly-frequency habits.
- Schema v22 backup/restore support for habit groups and custom templates.

## Data invariants

Habit history remains in the existing `habitEntries` table and is not rewritten by the v22 migration. Existing check/duration habits migrate in place. Quantity values are not capped at the target so over-target performance remains visible. Paused dates are neutral in adherence/streak calculations and cannot be edited until the pause is changed.

Groups are organizational metadata. Removing a group moves member habits to Ungrouped. Custom templates are independent definitions; deleting one never affects habits created from it.

## Frequency semantics

Fixed schedules evaluate only their due dates. Weekly frequency habits evaluate a prorated target per Monday-first calendar week. Monthly frequency habits evaluate a prorated target per calendar month. Creation dates and pause periods reduce the target proportionally instead of counting impossible days as failures.

Flexible reminder weekdays are notification prompts only. They never redefine whether a weekly/monthly frequency target has been met.
