# ChatGPT Patch Protocol v1

Phase 14 adds a controlled mutation protocol on top of the Phase 13 CREATE-only importer. The planner still has no embedded AI API: the user explicitly copies current planner context, asks ChatGPT for JSON, pastes the result back into the app, previews the exact diff, and then chooses whether to apply it.

## Envelope

```json
{
  "format": "folio-patch",
  "version": 1,
  "title": "Rebalance exam week",
  "timezone": "Europe/Berlin",
  "operations": []
}
```

The runtime schema is strict. Unknown fields are rejected. The public JSON Schema is available at `public/schema/folio-patch-v1.schema.json`.

## Stable identity and optimistic locking

UPDATE and DELETE target existing entities with two exact values copied from the planner:

```json
{
  "op": "update",
  "entity": "task",
  "id": "exact-existing-id",
  "ifUpdatedAt": "2026-08-20T17:10:41.832Z",
  "changes": {
    "plannedDate": "2026-08-24"
  }
}
```

The app validates `ifUpdatedAt` during Preview **and rechecks it inside the write transaction**. If the user changes the entity after copying context or Preview, Apply fails as stale rather than overwriting the newer state.

CREATE operations use import-local `ref` values. Same-patch Tasks may reference same-patch Projects or parent Tasks by those refs; real database IDs are allocated by the app.

## Supported entities

Patch v1 supports:

- Project
- Task
- Habit
- TimeBlock
- RecurringSeries

It does not patch FocusSession, HabitEntry, DailyPlan provenance/history, ImportBatch, PatchBatch, completion timestamps, database IDs, recurrence ownership, `recurrenceDate`, or created/updated timestamps.

## CREATE

CREATE uses the Phase 13 entity vocabulary. It can create a Project, Task, Habit, TimeBlock or RecurringSeries. Strict semantic validation still applies:

- Inbox Tasks remain unplanned and unassigned.
- Time Blocks may not attach to Inbox Tasks.
- subtasks remain one level deep.
- standalone events require titles.
- Time Blocks may not cross local midnight.
- recurring block duration requires a start time.
- stable recurrence belongs in RecurringSeries; irregular finite schedules should be concrete Tasks/blocks.

## UPDATE

### Project

Editable: name, description, color, icon, type, favorite, exam date and weekly target. Standard Projects cannot retain academic-only metadata.

### Task

Editable: title, description, project, priority, `todo|inbox`, planned date, hard deadline and estimate. Patch v1 deliberately cannot complete a Task. Completed/cancelled/trashed Tasks are not update targets.

### Habit

Editable: title, description, check/duration kind, target, schedule and capacity behavior. Check Habits remain target=1 and cannot consume duration capacity.

### TimeBlock

Editable: title, date, start minute and duration. The protocol does not change Task/Event linkage or kind. A Task block title may be edited, but Preview warns that this does not rename its linked Task.

### RecurringSeries

Editable: title, active/paused state, start date, rule and task-template content. Structural changes are blocked when future occurrences or generated blocks contain manual overrides. Existing completion-relative series cannot have their cadence/start rewritten through the patch protocol; the dedicated recurrence editor remains authoritative for that case.

## DELETE means the safest reversible domain action

DELETE is intentionally not a raw database delete:

| Entity | DELETE behavior |
|---|---|
| Task | Move to Trash; linked block/history remains recoverable |
| Project | Archive; assigned Tasks remain assigned |
| Habit | Archive; HabitEntry history remains |
| TimeBlock | Remove block, with exact patch snapshot for Undo/Revert |
| RecurringSeries | End/archive series and hide future incomplete occurrences; completed history remains |

Any patch containing DELETE requires an additional destructive-changes acknowledgment before Apply. The service checks that confirmation independently of the UI.

## Human diff preview

Preview shows each operation as current → proposed state rather than asking the user to approve raw JSON. It also reports:

- blocking validation errors;
- warnings;
- likely planning consequences;
- day-capacity deltas and overload;
- series reconciliation effects;
- deletion cascades/dependencies.

## Atomic application

The patch engine loads the affected planner graph into an in-memory workspace, records the **first before snapshot** for every touched entity, applies all operations to that workspace, records the final after snapshots, then writes the resulting graph and PatchBatch in one Dexie transaction.

A failure aborts the transaction; a partially applied patch is not an accepted state.

DailyPlan state is part of the snapshot graph. Changes that invalidate a committed plan return that day to Draft, and a Revert can restore the exact earlier DailyPlan/DailyPlanItem state.

## Undo and guarded historical Revert

Immediate Undo calls the same exact snapshot-based Revert mechanism.

Historical Revert is deliberately conservative. It succeeds only while the current touched graph still matches the patch's expected after-state. It blocks when later user work depends on the patch, for example:

- a created Task has Focus history;
- a created Habit has HabitEntry history;
- a created Project gained unrelated later Tasks;
- a created Task gained additional calendar blocks;
- a recurrence descendant was manually edited, completed or focused;
- an updated entity changed after the patch.

Untouched recurrence descendants automatically materialized after Apply remain attributable to their series and can be removed during safe Revert.

## Privacy boundary

The app does not send planner state to ChatGPT. `Copy patch context` is an explicit local clipboard action. The returned JSON must come back through the app's parser and Preview before it can change data.
