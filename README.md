# Folio — v1.4.0

A local-first personal productivity application with an editorial, low-noise interface.

**Release:** `1.4.0`  
**Repository:** `thiepn/folio`  
**IndexedDB schema:** `v13`  
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

## Data and privacy

Planner data is local-first in IndexedDB. The current database schema is **v13**. Full backups export schema v13 and direct restore supports compatible backups from **v8 through v13**. Restore is replace-only, validated, transactional, and guarded by an automatic pre-restore safety backup.

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

The app was developed through 21 implementation phases followed by a full-product audit and release-hardening/certification layers. Historical phase documents remain under `docs/` for traceability; `README.md`, runtime UI, the v13 data model, and `validate:final` define the current release state.

## v1.1.1 release hardening

- repeatable source, type, production-build, and dist-artifact validation;
- GitHub Actions CI for pull requests;
- verified GitHub Pages deployment from `main`;
- release checks for relative `/folio/` hosting and PWA/service-worker output;
- explicit compatibility gates for the pre-Folio database and structured payload formats;
- exact direct dependency pins;
- GitHub Pages `.nojekyll` and root 404 recovery.

See `docs/RELEASE_HARDENING_V1_1_1.md`.
