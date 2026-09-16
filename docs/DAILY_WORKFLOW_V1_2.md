# Folio v1.2 — Daily Workflow

Folio v1.2 makes **Today** the primary operating surface rather than another list view.

## Product contract

The daily page answers four questions in order:

1. **What carried over?** Resolve overdue work explicitly instead of silently accumulating it.
2. **What matters today?** The first three `Must` tasks form a visible Top 3; other work remains secondary.
3. **What should I do now?** Active Focus is surfaced first, otherwise Folio suggests the next unblocked priority.
4. **How do I close the day?** A small wrap-up records what moved forward and can roll unfinished work to tomorrow.

## Workflow surfaces

- **Carryover resolver:** Today / Tomorrow / Later / Done actions for overdue tasks.
- **Top 3:** derived from the ordered `Must` bucket; no duplicate priority model is introduced.
- **Today:** the remaining planned work, with existing planning roles and task controls intact.
- **Next:** tomorrow's tasks.
- **Later:** unscheduled open tasks.
- **Focus now:** resumes an active session or suggests the next unblocked priority.
- **Habits:** remains part of the daily operating loop.
- **Capacity + schedule:** retains the existing planning/capacity engine.
- **End-of-day wrap-up:** task/habit/focus summary, per-day note, and undoable roll-forward.

## Persistence and compatibility

No IndexedDB migration is required. Folio remains on schema **v12**. Top 3 reuses `DailyPlanItem.bucket = must`; Next/Later reuse task planning dates; wrap-up notes use the existing settings table under `daily.wrapup.<YYYY-MM-DD>`.

This avoids parallel representations of the same planning concepts and preserves all v1.1.1 backups and legacy migration behavior.
