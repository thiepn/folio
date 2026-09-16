# Folio v1.3 — Task & Project Workflow

Folio v1.3 strengthens the existing task system and turns Projects into execution workspaces rather than folders.

## Project workflow

Projects now persist:

- `status`: active, on hold, or completed;
- an optional project-level deadline;
- long-form context/notes separate from the short outcome summary;
- an explicit next-action task when the user wants to override Folio's derived ready task;
- embedded milestones with due dates and completion state;
- bounded project/milestone activity entries;
- completed timestamp for completed projects.

Project progress is intentionally **derived from actual root-task completion**. Folio does not introduce a second manually maintained percentage.

## Task workflow

The project workspace exposes the existing task engine more directly:

- filter by Open / Ready / Blocked / Completed / All;
- sort by manual order, priority, deadline, or planned date;
- quick actions for Today, Tomorrow, Later, Focus, and Set as next action;
- existing global bulk selection remains available;
- existing dependency readiness remains authoritative;
- existing recurring-task scope editing remains authoritative;
- existing subtasks remain the checklist/decomposition primitive.

This avoids duplicate task states and preserves the semantics already used by Today, Planner, Review, recurrence, Focus, and bulk actions.

## Migration

Database schema moves from **v12 to v13**.

The migration adds default project workflow fields to existing projects:

- `status = active`;
- `notes = ''`;
- `milestones = []`;
- a bounded activity history initialized with one migration entry.

Tasks are not migrated.

## Compatibility

- v8–v13 backups remain directly restorable.
- Existing v12 backups remain valid and are migrated after restore.
- Pre-Folio database-name migration remains unchanged.
- ChatGPT import/patch continues to use the canonical project create/update schemas, so supported project workflow fields remain validated at the same boundary.
