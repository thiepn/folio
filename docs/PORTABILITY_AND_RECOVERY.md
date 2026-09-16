# Portability & Recovery Contract

## Full backup
Format: `folio-backup`.

A full backup is the disaster-recovery artifact. It contains Tasks, Projects, Habits, HabitEntries, TimeBlocks, DailyPlans, DailyPlanItems, FocusSessions, RecurringSeries, Settings, ChatGPT Import/Patch provenance, and Calendar Import provenance.

Current export schema: **v12**.

## Restore policy
Restore is deliberately **replace-only**.

Before Apply:
1. parse the backup envelope;
2. require schema v8–v12;
3. normalize compatible older provenance records;
4. validate current entity row shapes;
5. reject duplicate primary keys;
6. validate core Task→Project/Parent/Series, Task dependency, HabitEntry→Habit, TimeBlock→Task, DailyPlanItem→Task, and Series→Project relationships;
7. warn about one recoverable active Focus session and reject multiple active sessions;
8. require explicit replacement acknowledgement.

At Apply:
1. create/download a fresh safety backup of the current DB;
2. rerun validation;
3. clear and restore all canonical tables in one Dexie transaction;
4. reload the application.

Backups newer than the running app are rejected. Backups older than v8 are not directly restored because pre-v8 Habit/Focus semantics are no longer guaranteed to be lossless. The safe upgrade path is to open them in a compatible v8+ build and export a fresh backup.

## Selective export
Format: `folio-selection`, version 1.

This is for archival, sharing context, or inspection—not database restore. Its filters are stored in the envelope so the recipient can see exactly what subset was exported.

Supported filters:
- Project;
- From date;
- Through date;
- Include completed Tasks.

No mutation/import action is attached to this envelope in Phase 15.

## Recovery principle
Native backups preserve application semantics. `.ics` preserves calendar time. ChatGPT Import/Patch preserves explicit planning mutations. These formats are intentionally separate instead of pretending one interchange format can losslessly represent all three domains.
