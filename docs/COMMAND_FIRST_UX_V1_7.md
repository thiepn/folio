# Folio v1.7 — Command-first UX

Folio v1.7 makes the existing local-first workspace substantially faster to operate without creating a separate automation system or replacing the normal UI.

## Principle

Every important command remains available by mouse/touch. Keyboard interaction is an acceleration layer, not a second product.

The Command Palette becomes the shared execution surface for navigation, creation, task actions, project access, habits, planning, review, settings, and workspace search.

## Command surface

`Ctrl/⌘ K` remains the configurable Command Palette binding. `/` is added as a fixed search/command alias.

The palette now supports:

- token-aware and fuzzy matching rather than one literal substring;
- nested command pickers;
- direct matching of nested actions from the root search;
- recent commands, stored locally as ephemeral UI state;
- back navigation with `←`, Backspace on an empty scoped query, or Escape;
- Home/End navigation in long result lists;
- clear breadcrumb context while a nested action is active;
- workspace search across tasks, projects, and habits.

Recent commands do not enter IndexedDB or backups. They are convenience state only.

## Task commands

The palette exposes focused task actions without generating a new task model:

- Open task…
- Complete task…
- Reopen task…
- Move task to Today…
- Move task to Tomorrow…
- Move task to Later…
- Start Focus on task…

Each action opens a task picker, but the root search can also match the action and task together. For example, a query such as `complete French` can directly surface the matching completion action.

Task commands reuse the existing task, daily-planning, dependency, Focus, and Undo services.

## Project and habit commands

The palette also exposes:

- New project
- Open project…
- New habit
- Open habit…
- Complete habit today…
- Skip habit today…

The existing project and habit editors remain authoritative.

## Fixed command-first aliases

These aliases are intentionally reserved and cannot be shadowed by configurable bindings:

- `/` — open search / Command Palette
- `N` — new task in the current context
- `P` — new project
- `T` — go directly to Today

Existing configurable shortcuts (`Q`, `F`, `J`, `K`, `X`, `?`, `Ctrl/⌘ K` by default), `G` navigation chords, task completion, bulk selection, and date nudging remain available.

`G` chords are resolved before single-key aliases, so `G` then `P` still means Planner rather than New Project.

## Mobile

The mobile top bar gains direct Search access so the same command surface remains available without a hardware keyboard.

## Persistence and compatibility

v1.7 does **not** change the planner data model.

- IndexedDB remains schema **v15**.
- No v1.7 migration is introduced.
- v8–v15 direct backup restore compatibility remains unchanged.
- Existing tasks, projects, habits, Focus sessions, reviews, planner data, shortcuts, and history remain valid.

## Release gate

v1.7 adds a dedicated Command-first UX contract to the existing release pipeline. The release must also continue passing all earlier milestone contracts, TypeScript, the production Vite build, dist validation, and GitHub Pages deployment.
