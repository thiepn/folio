# D15 — Templates & Automation

D15 adds reusable work structures and explicit, local automation to Folio without creating another planner data model.

## Templates

Templates are stored in Folio settings and therefore participate in normal backup/restore automatically.

### Task templates

Task templates can contain:

- Title and description
- Priority
- Estimate
- Tags
- Checklist items
- Relative planned-date offset
- Relative deadline offset
- Nested task trees

Relative dates are applied from a chosen creation anchor. Templates never store a hidden absolute "next date."

Existing task trees can be captured into templates. Completion state, comments, activity history, dependencies, recurrence IDs, and attachments are deliberately not copied into the reusable definition.

### Project templates

Project templates can contain:

- Project identity and description
- Standard or academic type
- Weekly academic target
- Relative project deadline
- Relative exam date
- Incomplete milestones with relative dates
- Root tasks and nested task trees

Existing projects can be captured. Completed milestones and historical project activity are intentionally excluded from the reusable definition.

Template instantiation is undoable. Project-template undo removes both the newly created project and all tasks created from it.

## Automations

Automations are explicit rules with:

1. One trigger
2. Zero or more conditions; all conditions must match
3. One or more actions

### Triggers

- Task created
- Task completed
- Daily check
- Manual only

Recurring task schedules remain owned by Folio's Recurrence engine. Automations do not duplicate recurring-series logic.

### Conditions

Rules can match:

- Project
- Tag
- Priority
- Status
- Title substring
- Has / has no deadline
- Due within N days

### Actions

Rules can:

- Set priority
- Add a tag
- Move / clear project
- Move / clear list
- Plan relative to the current date
- Set a relative deadline
- Create a task from a task template

Internal automation actions update Folio's existing task fields directly. They do not create a shadow automation state.

## Safety and determinism

### Reentrancy protection

The automation engine tracks active rule/task/trigger executions. Actions performed by an automation do not recursively retrigger the same automation engine path.

### Daily deduplication

Daily rules use a persisted date + rule + task execution key. The same daily rule is evaluated at most once per task per local date, even when Folio is reopened or returns from the background repeatedly.

Daily checks run:

- During database initialization
- When the app regains focus
- On pageshow
- When the document becomes visible

### Undo

Task creation/completion events collect successful automation side effects into the source task's normal undo chain.

Rules can be tested against a selected task without mutation or success-log writes. Manual automation runs apply the rule and return their own undo mutation.

### Failure isolation

An automation error is written to the run log but does not make the original task creation/completion fail.

## Run log

The local run log records:

- Rule
- Trigger
- Task
- Success / skipped / error state
- Applied-action summary or error
- Timestamp

The log is capped at 200 entries and can be cleared.

## Persistence

D15 remains on **database schema v23**.

Templates, rules, daily deduplication keys, and run logs live in the existing Settings table:

- `templates.custom.v1`
- `automation.rules.v1`
- `automation.log.v1`
- `automation.daily.keys.v1`

This keeps D15 portable without adding a schema v24.
