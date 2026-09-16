# Task Engine Contract

## Task states

User-facing active states in Phase 3:

- `inbox` — captured but not intentionally processed
- `todo` — actionable work
- `completed` — finished and reversible

The domain retains `cancelled` for forward compatibility, but Phase 3 does not expose cancellation in the task editor because there is not yet a dedicated cancelled-task browser.

## Time concepts

Task time remains intentionally separated:

- `plannedDate` — intended work day
- `deadline` — hard completion boundary
- `estimatedMinutes` — expected effort
- `TimeBlockEntity` — exact clock reservation, stored separately

Changing an existing planned date increments `rescheduleCount`. Assigning a first planned date does not count as postponement.

## Hierarchy

A subtask is a `TaskEntity` with `parentTaskId`.

Rules:

1. Phase 3 allows one subtask level.
2. Subtasks do not appear as root rows in Today, Inbox, Upcoming, or project open counts.
3. Parent task rows may display subtask progress.
4. Completing a parent completes open subtasks.
5. Adding new work to a completed parent reopens the parent.
6. Deleting a parent soft-deletes its active children in the same mutation.

## Completion and reopening

Before completion, the engine preserves `lastOpenStatus` when the task is in `inbox` or `todo`.

Reopen resolution:

```text
lastOpenStatus
    ↓ if absent
plannedDate ? todo : inbox
```

This prevents an Inbox item from becoming a normal task merely because it was completed once.

## Trash

`deletedAt` is the Trash boundary.

Active task queries must exclude it. Linked time blocks remain stored and are hidden by the time-block repository when their task is deleted.

Restore clears `deletedAt` for the selected task and child rows that were deleted with it.

## Undo

Undo operates on entity snapshots rather than inverse guesses. This matters because operations may affect multiple rows, such as parent completion or parent deletion.

Current UI exposes one latest undo action. Future history/command systems can build on the same semantic service boundary.

## Bulk operations

`taskService.bulkUpdate(ids, changes)` is the Phase 3 foundation. The primary multi-select interface is intentionally deferred to the later power-user UX phase.
