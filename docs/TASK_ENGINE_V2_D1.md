# D1 — Task Engine V2

D1 is the first phase of the Folio Deepening Program. Its purpose is to make a task a durable working object rather than a shallow title/date record.

## Scope

Task Engine V2 adds:

- flat task tags stored directly on the task;
- an inline checklist independent from nested tasks;
- automatic progress derived from checklist items and direct child tasks;
- optional manual progress from 0–100%;
- source/reference URL;
- free-form location context;
- task pinning;
- lightweight task comments;
- durable task activity history;
- recursively nested tasks instead of the previous one-level subtask ceiling;
- recursive completion, trash, restore, and tree duplication semantics;
- richer task-row metadata;
- a rebuilt task inspector that acts as the task workspace.

The existing `description` field remains the canonical notes body and is explicitly Markdown-compatible. A richer Markdown rendering/editing surface belongs to D9.

## Data model

IndexedDB advances from schema **v15 to v16**.

New `TaskEntity` fields:

```ts
tags: string[]
checklist: TaskChecklistItem[]
progressMode: 'auto' | 'manual'
progressPercent: number
sourceUrl?: string
location?: string
pinned: boolean
comments: TaskComment[]
activity: TaskActivityEntry[]
```

The migration is additive. Existing task identity, dates, recurrence links, dependencies, project links, completion state, and ordering are preserved.

## Hierarchy semantics

Tasks may now be nested to arbitrary depth.

Tree-sensitive operations operate on the complete descendant tree:

- completing a parent completes open descendants;
- trashing a parent trashes the subtree;
- restoring a parent restores the deleted subtree;
- duplicating a task duplicates the subtree with fresh IDs and remapped parent links.

A duplicated tree intentionally does not inherit recurrence membership, blocker links, completion state, comments, or checklist completion state.

## Progress

Automatic progress is derived from direct execution units:

```text
completed direct child tasks + completed checklist items
---------------------------------------------------------
all direct child tasks + all checklist items
```

A completed task always renders as 100%. Manual mode stores an explicit percentage. Automatic progress remains derived rather than persisted as authoritative state.

## Backup compatibility

- current backup schema: **v16**;
- direct restore floor remains **v8**;
- v8–v15 tasks are normalized with safe defaults for all D1 fields;
- no old backup is rewritten in place;
- restore remains replace-only and validated.

## Deliberate boundaries

D1 does **not** pretend to complete every TickTick-class task feature.

- advanced recurrence rules and occurrence semantics → **D2**;
- reminders and notification delivery → **D3**;
- full NLP capture → **D4**;
- global tag taxonomy, nested tags, folders and list organization → **D5**;
- binary/file/image attachments and rich Markdown rendering → **D9**;
- templates and automation → **D15**;
- collaboration comments/assignments → **D19**.

Binary attachments are specifically excluded from D1 because they require a separate Blob persistence, quota, backup, export, cleanup and later sync design. Storing only fake attachment metadata would create an unreliable subsystem.

## Certification

D1 adds `npm run validate:task-v2` to the full release verification chain. It checks the schema migration, model/schema fields, recursive hierarchy behavior, backup compatibility, nested navigation, task workspace surfaces and stylesheet integration.
