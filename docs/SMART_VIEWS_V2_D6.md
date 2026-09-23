# D6 — Advanced Filters, Smart Lists & Dynamic Views

D6 replaces Folio's legacy flat Saved Views with one canonical live-query system.

## Query model

A Smart View stores a nested filter tree:

```text
Group
├── operator: AND | OR
├── optional NOT
└── children
    ├── Condition
    └── Group
```

Groups can be nested up to five levels and views are limited to 64 filter nodes to keep evaluation bounded and understandable.

## Supported fields

- text;
- status;
- completion;
- priority;
- project;
- list;
- section;
- tag;
- planned date;
- deadline;
- recurring state;
- readiness / blocked state;
- estimate;
- reminder state;
- pinned state.

Text search covers title, description, location, source URL, tag snapshots and comments.

## Operators

Scalar/entity fields support `is`, `is not`, `in`, `not in`, `exists` and `does not exist` where appropriate.

Tags support:

- has any;
- has all;
- has none;
- optional descendant expansion.

Date fields support:

- today;
- tomorrow;
- overdue;
- within next N days;
- on;
- before / after;
- on or before / on or after;
- between;
- exists / does not exist.

Estimate supports numeric thresholds and ranges.

Reminder state supports:

- configured;
- none;
- due;
- snoozed;
- outstanding.

## Root versus nested task scope

Each Smart View can evaluate either:

- root tasks only;
- all task depths including nested tasks.

This is separate from the filter tree so a view does not need to encode hierarchy boilerplate.

## Sorting

Each Smart View stores up to four ordered sort rules. Fields include:

- manual order;
- planned date;
- deadline;
- priority;
- estimate;
- title;
- created;
- updated.

Sort rules are evaluated in order and fall back to task order/ID for deterministic output.

## Grouping

Results can be grouped by:

- none;
- project;
- list;
- section;
- priority;
- planned date;
- deadline;
- tag;
- status;
- readiness.

Grouping changes presentation only; it never duplicates or mutates task data.

## Built-in Smart Views

D6 converts the old hard-coded organization collections into query-engine definitions:

- All tasks;
- No list;
- High priority;
- Unscheduled;
- Blocked work;
- Due soon;
- Recurring;
- Has reminders.

Built-ins cannot be edited or deleted directly, but can be duplicated into a normal custom Smart View.

## Saved views

Custom Smart Views support:

- name;
- description;
- accent;
- icon;
- pin state;
- root/all-depth scope;
- nested filter query;
- multiple sort rules;
- grouping;
- duplicate;
- delete.

Pinned Smart Views appear in the desktop sidebar.

## Legacy Saved View migration

D6 reuses the existing `planning.savedViews` settings key so old user data is not abandoned.

Legacy fields such as:

- text query;
- project IDs;
- priorities;
- planned-date mode;
- deadline mode;
- ready/blocked mode;
- completion mode

are converted into the new query tree when first read. Dynamic legacy concepts remain dynamic: for example, legacy `Today` becomes the D6 `today` predicate rather than being frozen to the migration date.

Normalized D6 records are written back to the same settings key once migration succeeds.

## Live execution

Smart View results are derived from the canonical task table and current:

- projects;
- lists;
- sections;
- tag hierarchy;
- reminder definitions;
- reminder occurrences.

Counts and matching task IDs are recomputed by Dexie live queries, so edits immediately change Smart View results without a secondary index/database.

The query engine builds dependency, tag-descendant and reminder lookup indexes once per run to avoid repeatedly scanning those collections for every condition.

## Lists integration

Smart Views now live beside Lists and Tags. D5's four fixed smart buttons were removed and replaced by the D6 gallery.

Opening a Smart View shows:

- live result count;
- scope;
- grouping;
- sort rules;
- filter-rule count;
- grouped task results.

Tasks open and complete through the normal task workflow.

## Command palette and sidebar

Custom Smart Views can be pinned to the sidebar.

All built-in/custom Smart Views are searchable from the command palette and open in the Lists workspace.

## Planner consolidation

The old Planner Saved Views editor was removed. Planner keeps Forecast, while all reusable query perspectives use D6. This avoids two incompatible saved-filter formats in the UI.

## Persistence

D6 does **not** advance IndexedDB. Folio remains **schema v19**.

Smart Views live in the existing settings table and are already included in normal Folio backups. Legacy backup records are normalized when the settings value is read after restore.

## Guardrails

- maximum 50 custom Smart Views;
- maximum 64 query nodes per view;
- maximum five nested group levels;
- maximum four sort rules;
- duplicate view names are rejected;
- corrupt individual saved-view records are skipped instead of blocking app boot.

## Next

**D7 — Calendar V2** can now reuse Smart Views as live task sources for calendar sidebars and scheduling perspectives instead of creating another filtering layer.
