# Project Organization Contract

## Project purpose

A Project is an optional context container for related tasks.

Good examples:

- Analysis III
- French
- Website
- Prepare Sunday worship

A task is allowed to have no project.

## Project types

### Standard

Stores ordinary project metadata only.

### Academic

Adds optional:

```text
examDate
weeklyTargetMinutes
```

Academic remains a presentation/domain specialization of Project rather than a separate feature database.

## Archive behavior

Archive is preferred over deletion because project identity is referenced by historic/completed tasks.

Archived projects:

- disappear from the active Projects overview;
- cannot be assigned to new tasks through normal creation flows;
- remain resolvable for existing tasks;
- remain visible in Task Inspector if an existing task is still assigned;
- can be restored.

## Favorites

Favorites affect navigation only.

They do not alter priority, scheduling, or task ranking.

## Unassigned work

`No project` is the UI representation of non-Inbox tasks with no `projectId`. Inbox captures are intentionally excluded until processed.

It must never become a hidden auto-created Project row.

## Project schedule

A project schedule is derived from `TimeBlock.taskId → Task.projectId`.

Time Blocks do not store project IDs because task membership is the canonical relationship. This avoids project metadata becoming duplicated across Tasks and Time Blocks.

## Project activity

Phase 4 activity is a lightweight projection from Task data:

- newly created task;
- updated task;
- completed task.

It is explicitly not an audit log and should not be used for compliance/history guarantees.
