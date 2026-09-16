# Phase 2 Persistence Test Plan

Run after `npm install` and `npm run dev`.

## Fresh install
1. Clear site data.
2. Load the app.
3. Confirm the workspace is blank except for default settings.
4. Reload twice; confirm no user entities appear automatically.
5. Data & Storage → Load sample workspace; confirm sample entities appear once and cannot be loaded into a non-empty workspace.

## Task persistence
1. Add a task to Today.
2. Reload; task remains.
3. Complete task; reload; completion remains.
4. Reopen task; reload; task returns to its correct prior semantic state.

## Inbox persistence
1. Quick Add → Inbox.
2. Confirm live sidebar badge changes.
3. Reload; badge and item remain.

## Habit persistence
1. Toggle a habit.
2. Reload; dated entry remains.
3. Confirm a duration habit contributes remaining duration to Today capacity only when incomplete.

## Appearance migration
For a Phase 1 browser profile:
1. Populate `folio:appearance:v1` in localStorage.
2. Start Phase 2 with no IndexedDB appearance setting.
3. Confirm appearance is migrated and old key is removed.

## Backup
1. Open Data & Storage.
2. Export JSON backup.
3. Inspect root fields `format`, `version`, `exportedAt`, `data`.
4. Confirm all Phase 2 table arrays exist.

## Reset
1. Add custom test data.
2. Data & Storage → Reset.
3. Confirm custom local data is removed and the workspace restarts blank with default settings only.

## Migration fixture
To exercise v1 → v2 in automated/browser integration testing later:
1. Create v1 database records with `completed: boolean`.
2. Upgrade with current app.
3. Confirm `status`, timestamps, description and sort order are populated.
4. Confirm `completed` legacy property is removed.
