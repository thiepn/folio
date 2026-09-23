# D5 — Lists, Tags, Sections & Organization V2

D5 adds a first-class organization graph without collapsing Folio's existing project-management model into generic lists.

## Projects versus lists

Projects continue to represent execution-heavy outcomes, courses, work streams, milestones, next actions, deadlines and project progress.

Lists are lighter organizational containers. A task can belong to a project, a list, both, or neither.

This avoids the common failure mode where every organizational grouping has to pretend to be a project.

## Organization graph

D5 introduces four canonical entities:

- Folder — groups lists;
- List — lightweight task collection;
- Section — ordered subdivision inside one list;
- Tag — global reusable taxonomy with optional parent tag.

Tasks gain:

- `listId`;
- `sectionId`;
- stable `tagIds` alongside backward-compatible tag-name snapshots.

Recurring templates and occurrence exceptions carry the same organization metadata.

## Lists

Lists support:

- name and description;
- optional folder;
- color and icon metadata;
- favorite state;
- archive/restore;
- manual order metadata;
- per-list sort mode;
- per-list group mode;
- show/hide completed tasks.

Sort modes:

- manual;
- planned date;
- deadline;
- priority;
- title;
- created;
- recently updated.

Group modes:

- sections;
- none;
- scheduling state;
- priority;
- tag.

## Folders

Folders group lists independently of projects. They support ordering, collapse state, optional color/icon metadata, and durable archive metadata.

## Sections

Sections belong to exactly one list. A task may reference a section only when it also references that section's list.

Archiving a section:

- preserves the section entity for history/undo;
- removes direct section assignment from active tasks;
- removes the section from recurring templates and occurrence overrides;
- keeps the task's list assignment intact.

## Tags

D5 converts free-floating tag strings into a global registry.

Each Tag has:

- stable ID;
- display name;
- normalized unique name;
- optional parent tag;
- optional color;
- favorite state;
- archive state;
- sort order.

Existing `tags: string[]` remain on tasks/series as human-readable snapshots for backward compatibility and portable JSON, while `tagIds` are the canonical relationship.

Tag rename updates task and recurring-template snapshots. Tag merge rewrites source IDs to a target tag and is undoable.

Parent changes are cycle-checked. Backup restore independently validates the full tag hierarchy for cycles.

## v18 → v19 migration

The migration scans:

- existing tasks;
- recurring task templates;
- recurrence exceptions.

Every existing tag name becomes a canonical Tag entity. Stable deterministic migration IDs are generated from normalized tag names, then tasks/templates/exceptions receive corresponding `tagIds`.

Lists/folders/sections begin empty. Existing projects are deliberately not converted to lists.

## Lists workspace

The Lists navigation destination provides:

- folder/list tree;
- root lists;
- favorite lists in the sidebar;
- list task counts;
- global tag tree;
- tag usage counts;
- archived-list recovery;
- per-list controls;
- section creation and archive;
- section movement directly from list task rows.

Built-in smart collections:

- All tasks;
- No list;
- High priority;
- Unscheduled.

These are derived views, not duplicate task storage.

## Task workspace

The Task Inspector can assign:

- project;
- list;
- section;
- global tags.

Changing the list clears an incompatible section immediately. Known global tags are selectable as chips, while typed comma-separated names are resolved into the registry on save.

Nested tasks inherit the parent's project/list/section/tag context at creation.

## Capture

D4 capture now understands D5 list syntax:

- `^Personal`;
- `list:Admin`;
- `list:"Deep Work"`.

`~Project` remains project syntax. The two concepts are no longer aliases.

Multi-line capture can resolve a different list on each line. If no line-specific list is present, capture opened from inside a list inherits that current list.

## Recurrence

List/section/tag context propagates through:

- new recurring templates;
- materialized occurrences;
- completion-relative future occurrences;
- this-occurrence exceptions;
- this-and-future splits;
- entire-series edits.

An archived list can retain existing task links so restoring it restores the organization. New UI placement does not offer archived lists.

## Import/Patch

Structured Import v1 and Patch v1 now accept list/section placement plus tag names on task and recurring-template payloads.

List/section references target existing workspace IDs and are validated before application. Tag names are canonicalized through the global registry so Import/Patch cannot create a second tag representation.

## Backup/restore

Schema v19 backups include:

- folders;
- lists;
- sections;
- tags;
- task list/section/tag IDs;
- recurring template/exception organization links.

Restore validates:

- folder/list relationships;
- section/list relationships;
- task section ownership;
- recurring template/exception ownership;
- tag references;
- tag parent existence;
- tag hierarchy cycles.

Direct restore remains compatible from v8 through v19.

## Deliberate boundaries

D5 does not replace D6's query engine. The four built-in smart collections are fixed derived views; arbitrary AND/OR smart filters remain D6.

D5 also does not introduce team/shared-list semantics. Collaboration remains a later independent layer.

## Next

**D6 — Advanced Filters, Smart Lists & Dynamic Views** can now query stable project/list/section/tag relationships rather than parsing presentation strings.
