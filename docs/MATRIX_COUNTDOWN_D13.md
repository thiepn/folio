# D13 — Matrix / Countdown

D13 adds a decision layer on top of Folio's existing task and project model. It does not create another priority or deadline database.

## Matrix

The Matrix separates open to-do tasks using two existing signals:

- **Important:** task priority is High or Critical.
- **Urgent:** the task is overdue, its deadline falls inside the selected urgency horizon, or its planned date is today/past.

The four quadrants are:

1. **Do now** — important and urgent.
2. **Schedule** — important and not urgent.
3. **Quick / delegate** — urgent with normal priority.
4. **Later / reconsider** — neither urgent nor important.

The urgency horizon can be switched between Today, 3 days, 7 days, and 14 days. The horizon is a view preference only and is not stored into tasks.

### Matrix actions

Matrix actions modify the same source-of-truth task fields used throughout Folio:

- Mark Important → priority High
- Set Normal → priority Normal
- Today → existing Daily Planning move-to-Today flow
- Done → existing task completion flow

All mutations use Folio's existing undoable services.

## Countdown

Countdown combines dated commitments from several existing domains:

- Task deadlines
- Project deadlines
- Academic exam dates
- Incomplete project milestone due dates

Completed/archived projects and completed milestones are excluded. Completed tasks are excluded.

Items are grouped conceptually into:

- Overdue
- Today
- Next 7 days
- 8–30 days
- Later

The view supports 7-day, 30-day, 90-day, 365-day, and all-time windows plus type and text filters.

## Data model

D13 stays on **database schema v23**. No matrix quadrant, urgency flag, or countdown entity is persisted.

This is deliberate:

- Importance remains task priority.
- Urgency remains a calculation from current dates.
- Countdown remains a projection of task/project/milestone data.
- Moving a task in another Folio surface immediately changes Matrix/Countdown classification.

This avoids hidden state and contradictory prioritization systems.
