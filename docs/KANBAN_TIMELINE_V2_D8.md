# D8 — Kanban & Timeline V2

D8 adds two new task perspectives without creating duplicate task stores.

## Design rule

Kanban and Timeline are views over canonical Task entities.

- Kanban columns derive from existing task/list/project fields.
- List sections are the canonical user-defined Kanban columns.
- Timeline uses dedicated task span fields so planned date and deadline retain their D2 meanings.

## Kanban

Kanban can group columns by:

- list sections;
- status;
- priority;
- lists;
- projects.

List boards default to Sections, so adding a board column creates a normal D5 Section rather than a board-only object.

Other sources such as tags, projects and Smart Views can use status/priority/list/project columns.

### Drag semantics

Dropping a card mutates the canonical task:

- Section column → listId/sectionId;
- List column → listId and clears section;
- Project column → projectId;
- Priority column → priority;
- Status column → normal task completion/reopen semantics.

Every mutation is undoable through Folio's normal undo system.

### Sorting

Boards support:

- manual/task order;
- priority;
- deadline;
- planned date;
- title.

### Swimlanes

Boards can add a second horizontal dimension:

- none;
- project;
- list;
- priority.

Each column displays open/total WIP counts for the current swimlane.

## Timeline data model

D8 advances IndexedDB from **v19 to v20**.

Tasks gain:

- `timelineStart`;
- `timelineEnd`;
- `timelineMilestone`.

These fields are deliberately independent of:

- `plannedDate` — when the user intends to work on the task;
- `deadline` — the hard due date.

A Timeline span can therefore describe a multi-day project task without changing either scheduling or deadline semantics.

## Timeline semantics

- A normal span requires start and has end >= start.
- Missing end defaults to the start date.
- A milestone always uses one date.
- Clearing the start removes the task from Timeline.
- Recurring-task timeline placement is occurrence-local and stored as a D2 recurrence exception; it is never promoted to the recurring series template.

## Timeline workspace

Timeline supports:

- Day zoom;
- Week zoom;
- Month zoom;
- previous/current/next range navigation;
- Today line;
- unscheduled task backlog;
- drag backlog task onto timeline;
- quick-place at Today;
- drag entire span;
- resize left edge;
- resize right edge;
- milestone diamonds;
- hard-deadline diamonds;
- project milestone lane;
- dependency connectors;
- completion toggle;
- remove-from-timeline.

Project timelines overlay project milestone dates while task deadlines remain separate markers.

## Integration surfaces

D8 adds Board/Timeline perspectives to:

- Lists;
- Tag task collections;
- D6 Smart Views;
- Projects.

Each perspective uses the same source task set already selected by its parent surface.

## Task Inspector

Task properties now include:

- Timeline start;
- Timeline end;
- Timeline milestone.

These fields use normal Task save/scoped-recurrence semantics.

## Import / Patch

Task payloads in Import v1 and Patch v1 can exchange Timeline start/end/milestone fields.

Validation rejects:

- end without start;
- end before start;
- multi-day milestones.

Recurring-series templates intentionally do not expose absolute Timeline spans.

## Backup / restore

Schema v20 backups preserve task and recurrence-exception timeline fields.

Backups from v8–v19 remain directly restorable. Older backups receive empty Timeline spans and `timelineMilestone=false` during normalization.

Restore validates task and recurring-exception span invariants before replacement.

## Deliberate boundaries

D8 does not turn Timeline into a second calendar. Exact clock scheduling remains D7 Calendar V2.

D8 does not add a separate Kanban-column table. D5 Sections remain the custom column primitive.

D8 does not add project-level Gantt entities; task dependencies and project milestones are rendered from existing canonical objects.

## Next

**D9 — Notes, Rich Task Content & Attachments** can deepen what lives inside a task without changing Kanban/Timeline semantics.
