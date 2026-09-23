# Folio — v1.8.0

A local-first personal productivity application with an editorial, low-noise interface.

**Release:** `1.8.0`

**Repository:** `thiepn/folio`

**IndexedDB schema:** `v19`

**Status:** release-hardened · GitHub Pages ready


## Live deployment

**Pages target:** `https://thiepn.github.io/folio/`

The repository includes CI and GitHub Pages workflows. One-time setup: **Settings → Pages → Build and deployment → Source → GitHub Actions**. Every deployment from `main` must pass the full `npm run release:verify` gate before the verified `dist/` artifact is published.

## Core system

Capture → organize → plan → timeblock → focus → review → forecast → replan.

The v1.1 line keeps the v12 data model and adds:

- clean blank first-run behavior instead of silently inserting sample data;
- optional sample workspace loading from Data & storage;
- global search across tasks, projects, habits, and commands;
- remembered primary view across reloads;
- contextual desktop top bar and clearer mobile location label;
- stronger first-run and empty-state guidance.

The v1 release includes:

- Inbox and deterministic Quick Add;
- Projects and academic planning;
- Today / Daily Plan;
- Week, Upcoming, Calendar, and timeblocking;
- recurring tasks and series;
- Focus sessions;
- Habits;
- Review and planning feedback;
- task dependencies and readiness;
- Forecast and Saved Views;
- ChatGPT Import v1 and Patch v1 with explicit preview/validation boundaries;
- native JSON backup/restore;
- calendar `.ics` portability;
- offline/PWA architecture;
- keyboard and power-user workflows;
- mobile/responsive layouts;
- accessibility and recovery safeguards;
- customizable Folio appearance.

## v1.2 — Daily Workflow

Today is now Folio's daily operating surface: explicit carryover resolution, a protected Top 3, Today/Next/Later triage, current Focus context, habits and capacity in one hierarchy, plus an end-of-day wrap-up with undoable roll-forward. The release intentionally reuses the v12 planning model rather than introducing duplicate priority or triage state.

See `docs/DAILY_WORKFLOW_V1_2.md`.
## v1.3 — Task & Project Workflow

Projects now carry execution state: status, project deadline, context notes, an explicit next action, milestones, derived task progress, and project/milestone activity. Project task views add Ready/Blocked/Completed filters, useful sorts, and direct Today/Tomorrow/Later/Focus/Next actions while preserving the existing task, recurrence, dependency, selection, and saved-view systems. Schema v13 migrates existing projects without changing task storage.

See `docs/TASK_PROJECT_WORKFLOW_V1_3.md`.

## v1.4 — Planner Overhaul

Planner is now one coherent planning workspace with Agenda, Day, Week, Month, exact-time Calendar, and Forecast modes. Day/Week/Month share date context, expose the unscheduled backlog beside the plan, and keep **planned work date** distinct from **hard deadline**. Week planning surfaces due-but-unplanned tasks with capacity-aware placement suggestions; Month adds a 42-day workload/deadline map; keyboard and drag rescheduling change only the planned date. Schema v13 is retained.

See `docs/PLANNER_OVERHAUL_V1_4.md`.

## v1.5 — Reviews & History

Review is now durable rather than week-bound. End-of-day wrap-ups create daily review records, the guided weekly workflow saves written reflection, monthly reviews use the same lightweight record model, and a searchable History tab reconstructs completed tasks, focus sessions, habit entries, project/milestone activity, and saved reviews from canonical data. Schema v14 adds only the `reviewRecords` table.

See `docs/REVIEWS_HISTORY_V1_5.md`.

## v1.6 — Habits & Focus refinement

Habits now support durable pause periods that remain neutral in streaks, adherence, weekly targets, capacity, and history. Habit detail adds an eight-week trend and pause lifecycle controls. Focus now ranks ready work, explains the suggestion, supports a session intention, optional planned duration for open stopwatch sessions, finish notes, and richer recent-session context. Schema v15 backfills Habit pause histories while keeping the existing task/project/planner model intact.

See `docs/HABITS_FOCUS_V1_6.md`.

## v1.7 — Command-first UX

The Command Palette is now an execution surface rather than only a search box: nested task/project/habit actions, fuzzy and token-aware matching, direct deep matches, recent commands, and scoped keyboard navigation. Fixed aliases add `/` for command/search, `N` for a contextual new task, `P` for a new project, and `T` for Today while preserving configurable shortcuts and `G` navigation chords. Mobile now has direct Search access. Schema v15 is retained.

See `docs/COMMAND_FIRST_UX_V1_7.md`.

## v1.8 — Visual & Interaction Refinement

Folio now uses a warmer, higher-contrast editorial desk system across every existing workflow: a calmer navigation rail, stronger page hierarchy, open ruled sections in place of repetitive dashboard cards, denser readable content, sharper interaction states, restrained motion, and a purpose-built mobile reading surface. The release is visual-only at the product-model boundary: all v1.7 behavior, commands, keyboard workflows, and the IndexedDB v15 schema are retained.

See `docs/VISUAL_INTERACTION_REFINEMENT_V1_8.md`.

## D1 — Task Engine V2

The Folio Deepening Program begins by expanding the task itself. Tasks now support tags, checklists, automatic or manual progress, URL/location context, pinning, comments, activity history, and recursively nested task trees. Completion, trash, restore, duplication, navigation and Focus now respect the deeper hierarchy. Schema v16 is an additive task migration and backups remain directly restorable from v8 through v16.

Binary attachments, the global tag taxonomy, advanced recurrence and reminders remain separate later deepening phases rather than being partially simulated here.

See `docs/TASK_ENGINE_V2_D1.md`.

## D2 — Dates, Scheduling & Recurrence Engine V2

Recurring work now has a substantially deeper date engine: Monday-first calendar-week intervals, multiple monthly dates, month-end clamping, nth/last weekday rules, last-day rules, selected yearly months, and completion-relative day/week/month/year schedules. One-off occurrence edits are persisted as exceptions, `recurrenceDate` remains the logical slot identity, series splits preserve future exceptions, and exact recurring time blocks honor the series time zone across DST transitions.

Recurring templates now also carry the D1 task context—tags, checklist structure, URL, location and pin state. IndexedDB advances to schema v17 while direct backup restore remains compatible from v8 through v17.

See `docs/DATES_RECURRENCE_V2_D2.md`.

## D3 — Reminders & Notification Engine

Folio now has a durable reminder definition/occurrence engine rather than transient timers. Tasks support multiple planned-date, deadline, calendar-block-relative and exact-time reminders; recurring series can own reminder definitions that automatically follow their materialized task occurrences; fixed-schedule habits support reminder times; and the Reminder Center adds snooze, dismiss, due/upcoming views, system notification permission, daily-planning reminders and overdue summaries.

Reminder occurrences remain in-app even when system-notification permission is unavailable. Browser/PWA notifications use the service worker when possible, with Snooze and Dismiss actions. The scheduler reconciles missed reminders on reopen/focus without replaying a backlog of recurring daily alerts. Schema v18 adds durable reminder definition and occurrence tables, with direct backup restore remaining compatible from v8 through v18.

See `docs/REMINDERS_NOTIFICATION_ENGINE_D3.md`.

## D4 — Capture Engine V2 & Natural-Language Quick Add

Quick Add now parses substantially richer local natural language into Folio's existing canonical models: natural dates and deadlines, 12/24-hour times and ranges, duration phrases, priorities, explicit project selectors, D1 tags, advanced D2 recurrence rules, and D3 reminders. Legacy compact syntax remains supported.

Quick Add also accepts one task per line. Multi-line paste shows an independent interpretation for every row and creates the batch through one rollback-safe capture pipeline, including recurring series, time blocks, tags, and reminders. D4 adds no parallel storage model and keeps IndexedDB at schema v18.

See `docs/CAPTURE_ENGINE_V2_D4.md`.

## D5 — Lists, Tags, Sections & Organization V2

Folio now separates lightweight organization from project management. Tasks can belong to folders/lists/sections independently of Projects, while D1 tag strings are backed by a stable global tag registry with nested tags, favorites, archive state, rename/merge semantics and usage counts. Lists support per-list sorting/grouping, sections, favorites, archive/restore, and derived smart collections for All tasks, No list, High priority and Unscheduled.

Schema v19 migrates every existing task/series tag into canonical Tag entities without converting existing Projects into lists. D4 capture now supports explicit list syntax, recurring tasks preserve organization metadata, and Import/Patch plus full backup/restore understand list/section/tag relationships.

See `docs/ORGANIZATION_V2_D5.md`.

## Data and privacy

Planner data is local-first in IndexedDB. The current database schema is **v19**. Full backups export schema v19, including Task Engine V2, Recurrence Engine V2, reminder definitions/occurrences, folders/lists/sections/tags, and durable review records; direct restore supports compatible backups from **v8 through v19**. Restore is replace-only, validated, transactional, and guarded by an automatic pre-restore safety backup.

Fresh installs begin with an empty personal workspace. Optional sample data can be loaded explicitly from Data & storage.

The app does not require an embedded AI backend. ChatGPT Import/Patch consume explicit structured payloads rather than granting an AI direct database access.

## Folio rebrand compatibility

The v1.1 Folio build adopts the Folio identity throughout the UI, PWA metadata, exports, calendar metadata, structured import/patch protocols, documentation, and release packaging. Existing local data from the pre-Folio build is migrated automatically to the `folio` IndexedDB database on first launch. Older JSON backups/import/patch payloads remain accepted and are normalized to the Folio formats; newly generated files use `folio-*` identifiers only.

## Development

```bash
npm install
npm run validate:final
npm run typecheck
npm run build
npm run dev
```

Direct dependency versions and `package-lock.json` are committed for repeatable release builds.

## Release history

The app was developed through 21 implementation phases followed by a full-product audit and release-hardening/certification layers. Historical phase documents remain under `docs/` for traceability; `README.md`, runtime UI, the v19 data model, and `validate:final` define the current source state.

## v1.1.1 release hardening

- repeatable source, type, production-build, and dist-artifact validation;
- GitHub Actions CI for pull requests;
- verified GitHub Pages deployment from `main`;
- release checks for relative `/folio/` hosting and PWA/service-worker output;
- explicit compatibility gates for the pre-Folio database and structured payload formats;
- exact direct dependency pins;
- GitHub Pages `.nojekyll` and root 404 recovery.

See `docs/RELEASE_HARDENING_V1_1_1.md`.
