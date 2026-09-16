# Folio v1.5 — Reviews & History

## Purpose

v1.5 turns Review from a transient weekly dashboard into a durable reflection and history system.

The release is deliberately not an analytics expansion. It preserves Folio's local-first model and records only the reflection that cannot be reconstructed later, while deriving activity history from existing canonical task, focus, habit, and project data.

## Durable review records

IndexedDB schema v14 adds one table: `reviewRecords`.

A review record stores:

- review kind: daily, weekly, or monthly;
- period start/end;
- optional title;
- summary;
- wins;
- friction;
- lessons;
- next focus;
- a metric snapshot captured when the review is saved;
- created/updated/completed timestamps.

There is at most one canonical review record per review kind + period start. Saving the same period updates the existing record rather than creating duplicates.

## Daily review

Today's existing end-of-day wrap-up remains the daily ritual. Saving the wrap-up also creates or updates the day's durable review record and captures current daily metrics. This avoids adding a second end-of-day workflow.

A daily record may also be created or edited from Review → Saved reviews.

## Weekly review

The guided weekly review still resolves:

1. carryover;
2. postponed/stale work;
3. overdue and upcoming deadlines;
4. next-week planning context.

Its final step now captures written reflection:

- week summary;
- wins;
- friction;
- lessons;
- next focus.

Saving the workflow persists the review before opening Planner.

## Monthly review

Monthly reviews use the same record model and lightweight editor. They are intentionally reflection-first rather than a second dashboard.

## Metric snapshots

When a review is saved Folio snapshots:

- tasks planned in the period;
- planned tasks completed by period end;
- tasks actually completed during the period;
- focus duration and session count;
- habit completions;
- scheduled task minutes;
- completed milestones;
- active projects touched by completed work/focus.

The snapshot makes old reviews readable even as current task/project state changes.

## Searchable history

The History tab derives a unified timeline from canonical data:

- completed tasks;
- finished focus sessions;
- completed/skipped habit entries;
- project activity and milestone events;
- saved review records.

History supports text search and type filtering. It does not duplicate these canonical entities into another event database.

## Backup / restore

Full backup schema advances to v14 and includes `reviewRecords`. Direct restore remains compatible with v8–v14 backups; pre-v14 backups normalize `reviewRecords` to an empty collection.

v1.5 also hardens the project backup parser so v13 project execution fields—notes, status, deadline, next action, milestones, activity, and completion timestamp—are preserved during restore.

## Compatibility

- database name remains `folio`;
- schema advances v13 → v14 only to add `reviewRecords`;
- task, project, habit, focus, planner, recurrence, and calendar tables are otherwise unchanged;
- older compatible backups remain directly restorable;
- Daily Workflow, Task & Project Workflow, and Planner Overhaul contracts remain required release gates.
