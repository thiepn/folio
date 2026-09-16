# Folio Import Protocol v1

Phase 13 defines the first external structured-import contract for Folio.

The protocol exists so ChatGPT or another language model can translate free-form planning instructions into data the local planner can validate and apply. The planner itself does not call an AI API and does not send local planner data anywhere.

## Safety boundary

Import v1 is **CREATE-only**.

It may create:

- Projects;
- Tasks and one-level Subtasks;
- Habits;
- Time Blocks / standalone Events;
- Recurring Series and their materialized Task occurrences.

It cannot:

- edit an existing Task, Habit, Series or Project;
- delete existing data;
- complete existing Tasks;
- move existing calendar blocks;
- modify existing recurring rules;
- execute arbitrary commands.

Unknown JSON properties are rejected at the schema boundary rather than silently ignored.

## Transport

The canonical root is:

```json
{
  "format": "folio-import",
  "version": 1,
  "title": "Example plan",
  "timezone": "Europe/Berlin",
  "projects": [],
  "tasks": [],
  "habits": [],
  "timeBlocks": [],
  "recurringSeries": []
}
```

The public structural JSON Schema is shipped at:

```text
/schema/folio-import-v1.schema.json
```

Runtime Zod validation plus semantic validation remains authoritative because JSON Schema cannot express all graph and planning invariants.

## Client references

AI-generated objects do not supply application UUIDs.

They use short import-local references:

```json
{
  "ref": "analysis-project",
  "name": "Analysis III"
}
```

Another object can then use:

```json
{
  "projectRef": "analysis-project"
}
```

The application allocates real IDs during Apply.

### Existing projects

Existing planner objects may not be guessed by name.

The copied AI instructions contain the exact IDs of currently active Projects. An imported Task may use:

```json
{
  "projectId": "exact-existing-project-id"
}
```

The runtime rejects IDs that were not present in the local project database.

## Projects

Example:

```json
{
  "ref": "analysis",
  "name": "Analysis III",
  "description": "University course",
  "type": "academic",
  "color": "#4169FF",
  "icon": "∑",
  "favorite": true,
  "examDate": "2027-02-12",
  "weeklyTargetMinutes": 300
}
```

## Tasks

Example:

```json
{
  "ref": "sheet-6",
  "title": "Finish Analysis Sheet 6",
  "description": "Complete remaining exercises",
  "projectRef": "analysis",
  "priority": "high",
  "status": "todo",
  "plannedDate": "2026-08-21",
  "deadline": "2026-08-22",
  "estimatedMinutes": 90
}
```

### Subtasks

One level is supported:

```json
{
  "ref": "sheet-6-q4",
  "parentRef": "sheet-6",
  "title": "Question 4",
  "priority": "normal",
  "status": "todo"
}
```

A Subtask cannot itself own another imported Subtask.

### Inbox captures

An imported Inbox Task must remain unplanned and unassigned:

```json
{
  "ref": "idea",
  "title": "Investigate theorem source",
  "status": "inbox"
}
```

`projectRef`, `projectId`, `plannedDate`, and linked Task Time Blocks are invalid for Inbox captures.

## Time Blocks

### Task block

A Task block can reference only a Task created in the same batch:

```json
{
  "ref": "sheet-6-block",
  "kind": "task",
  "taskRef": "sheet-6",
  "date": "2026-08-21",
  "startMinute": 840,
  "durationMinutes": 90
}
```

`startMinute` is minutes after local midnight.

Examples:

```text
09:00 → 540
14:00 → 840
17:30 → 1050
```

### Standalone event

```json
{
  "ref": "lecture",
  "kind": "event",
  "title": "Analysis lecture",
  "date": "2026-08-21",
  "startMinute": 540,
  "durationMinutes": 90
}
```

Blocks may not cross local midnight in v1.

## Habits

### Check habit

```json
{
  "ref": "bible",
  "title": "Bible reading",
  "kind": "check",
  "target": 1,
  "schedule": { "type": "daily" },
  "countsTowardCapacity": false
}
```

### Duration habit

```json
{
  "ref": "french",
  "title": "French",
  "kind": "duration",
  "target": 30,
  "schedule": {
    "type": "selected-days",
    "weekdays": [1, 3, 5]
  },
  "countsTowardCapacity": true
}
```

Weekday numbering follows JavaScript / the recurrence engine:

```text
0 Sunday
1 Monday
2 Tuesday
3 Wednesday
4 Thursday
5 Friday
6 Saturday
```

Flexible `times-per-week` duration habits are allowed, but their minutes are not assigned to arbitrary days for capacity preview.

## Recurring Series

Use a Recurring Series only for a stable repeated pattern.

Example:

```json
{
  "ref": "french-series",
  "title": "French review",
  "startDate": "2026-08-24",
  "timezone": "Europe/Berlin",
  "rule": {
    "frequency": "weekly",
    "interval": 1,
    "weekdays": [1, 3, 5]
  },
  "taskTemplate": {
    "title": "French review",
    "description": "Vocabulary and listening",
    "projectRef": "french-project",
    "priority": "normal",
    "estimatedMinutes": 30,
    "startMinute": 1020,
    "blockDurationMinutes": 30
  }
}
```

Supported recurrence families are the existing Phase 9 engine rules:

- daily;
- weekly / selected weekdays;
- monthly;
- yearly;
- after-completion;
- interval values;
- optional end date or occurrence count.

Complex finite schedules should normally be represented as concrete dated Tasks/Time Blocks rather than as an artificial recurrence rule.

## Validation pipeline

Every import follows:

```text
raw text
  ↓
JSON parse
  ↓
strict structural schema
  ↓
reference-graph validation
  ↓
semantic planning validation
  ↓
duplicate/conflict analysis
  ↓
capacity analysis
  ↓
human-readable Preview
  ↓
explicit Apply
```

### Blocking validation examples

- malformed JSON;
- unknown properties;
- duplicate client refs;
- unresolved project/task refs;
- invalid existing Project IDs;
- nested Subtasks deeper than one level;
- Inbox Tasks linked to scheduling/project data;
- event without title;
- block crossing midnight;
- recurrence ending before its start date;
- recurrence expansion above the hard safety ceiling.

### Warning examples

- probable duplicate Task;
- duplicate Project name;
- calendar overlap;
- imported blocks overlapping each other;
- recurrence-generated overlap;
- plan date after hard deadline;
- overloaded day;
- large but permitted recurrence materialization;
- flexible weekly Habit that cannot be assigned to a specific day for capacity analysis.

Warnings do not prevent Apply. Errors do.

## Human preview

The application does not ask the user to approve raw JSON.

Preview shows:

- entity counts;
- generated recurrence occurrence/block counts;
- blocking errors;
- warnings;
- date-by-date capacity impact;
- human-readable rows describing what will be created.

Raw JSON remains transport/debug data only.

## Atomic Apply

Apply allocates real IDs and writes the whole graph inside one Dexie transaction.

Either the complete import succeeds or no partial graph is committed.

If imported planned Tasks affect an already committed Daily Plan, that day is changed to Draft because the user's committed arrangement has changed.

The previous DailyPlan records are retained in the Import Batch provenance for safe immediate Undo.

## Import provenance

Schema v9 stores:

```text
ImportBatch
├── id
├── title
├── source
├── status
├── affectedEntities[]
├── priorDailyPlans[]
├── createdAt
├── updatedAt
└── revertedAt?
```

`affectedEntities` stores typed IDs rather than an untyped list.

## Undo and History Revert

Immediate Apply returns the normal application Undo operation.

History also exposes Revert, but Revert is intentionally guarded.

The app refuses automatic historical Revert if imported data has since acquired dependent user work, including examples such as:

- imported Task edited;
- imported Project edited;
- imported Habit edited or logged;
- imported Series edited;
- recurring occurrence completed or manually changed;
- Focus history linked to imported Tasks;
- new manual Time Blocks attached;
- new Subtasks added;
- later Tasks attached to an imported Project;
- subsequent planning edits that make restoring an old Daily Plan unsafe.

Unchanged recurrence-generated descendants are attributable through the imported Series and can be removed together with the batch.

The rule is conservative:

> Refuse an automatic rollback rather than destroy later user work.

## ChatGPT workflow

1. Open **Import plan**.
2. Select **Copy AI instructions**.
3. Paste those instructions into the planning chat.
4. Describe the desired schedule in normal language.
5. ChatGPT returns one JSON document.
6. Paste it into the planner or load a `.json` file.
7. Select **Preview**.
8. Resolve any blocking errors or review warnings.
9. Select **Apply import**.
10. Use Undo immediately or History → Revert while the batch remains safely reversible.

## Phase 14 boundary

Import v1 remains CREATE-only permanently.

Phase 14 may define a separate patch protocol for stable-ID `CREATE / UPDATE / DELETE` operations, with a different schema, diff preview, and stronger confirmation semantics. Those operations must not be retrofitted into Import v1.
