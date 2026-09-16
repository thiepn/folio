# Data Model — Phase 19

Current IndexedDB schema: **v12**.

Canonical entities remain:

- `Task`
- `Project`
- `Habit` + `HabitEntry`
- `TimeBlock`
- `DailyPlan` + `DailyPlanItem`
- `FocusSession`
- `RecurringSeries`
- `Setting`
- `ImportBatch`
- `PatchBatch`
- `CalendarImportBatch`

Phase 19 does **not** introduce a new entity table. It adds one persisted relationship to Task and one Settings value.

## Task dependency field

`TaskEntity` now contains:

```text
blockedByTaskIds: EntityId[]
```

Meaning:

> This Task is not ready for execution while any referenced prerequisite remains unfinished.

The Task store has a multi-entry index:

```text
*blockedByTaskIds
```

### Dependency invariants

- referenced IDs must identify existing Tasks;
- Task cannot reference itself;
- dependency graph must remain acyclic;
- both endpoints must be top-level processed Tasks;
- completed prerequisites remain valid/satisfied references;
- Inbox Tasks cannot retain prerequisites;
- duplicate Task operations clear dependency relationships.

## Settings

Saved views are persisted in the existing Setting table:

```text
key: planning.savedViews
value: SavedTaskView[]
```

Each saved view stores only filter configuration and timestamps. It does not store matching Task IDs as authoritative membership.

The service caps custom saved views at 12.

## Derived-only Phase 19 models

The following are intentionally **not database entities**:

```text
ForecastDay
ForecastWeek
DeadlinePressureItem
ProjectPlanningSummary
blocked / ready status
```

They are recalculated from canonical Tasks, Habits, Daily Plans and Projects.

This avoids stale planning-summary data and unnecessary synchronization logic.

## Migration v11 → v12

Migration initializes all pre-Phase-19 Tasks with:

```text
blockedByTaskIds = []
```

No existing Task relationships or content are otherwise changed.

Migration chain:

`v1 → v2 → v3 → v4 → v5 → v6 → v7 → v8 → v9 → v10 → v11 → v12`

## Backup compatibility

Phase 19 adds a public v12 native-backup schema.

Runtime backup parsing defaults missing blocker arrays to `[]`, allowing recent pre-v12 backup data to be normalized safely.

Restore semantic validation now checks prerequisite relationships and rejects dependency cycles before replacement is allowed.

Saved views require no special backup table because the Settings table is already included in native backup/restore.

## Domain ownership

```text
Dependency mutation
→ DependencyService
→ TaskRepository

Saved-view mutation
→ SavedViewService
→ SettingsRepository

Forecast / pressure / summaries
→ pure analysis
→ no database writes
```

UI/features continue to avoid direct IndexedDB access.

---

## Phase 20 note — no persistence change

Phase 20 does not advance the database schema.

```text
DATABASE_SCHEMA_VERSION = 12
```

Accessibility, browser compatibility, runtime issue reporting, dialog focus ownership, reduced-motion state, and performance diagnostics are runtime/interface concerns rather than planner entities.

The only data-access change is query consolidation: the primary application hook now reads a single Task snapshot and a single Project snapshot and derives common views in memory. Persisted Task/Project shapes remain unchanged from Phase 19.
