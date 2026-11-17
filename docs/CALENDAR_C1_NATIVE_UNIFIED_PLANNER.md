# Calendar C1 — Native unified planning (development branch)

C1 is implemented as a first-class route inside the Folio owner application, not a new calendar or task database.

## Shipped source changes

- Dedicated desktop/mobile Calendar navigation backed by Folio's existing seven-mode Calendar V2 and task/time-block scheduler.
- Calendar sidebar sources for due/overdue work and unplanned tasks; deadline is visibly distinct from planned date.
- Selected-day native habit activity from `useHabitData`: complete/undo, increment quantity or duration and rest-day toggle through Folio HabitService with existing undo receipts.
- Local source status explicitly distinguishes Folio from unconnected Google/KLIPS and explains ICS snapshot limitations.
- Versioned same-origin `FolioCalendarPortV1` adapter reads minimal private device-local projections and routes scheduling/habit writes to existing canonical services.
- Existing D7 time-zone/recurrence/time-grid/D18 sync behavior and historical IDs unchanged; no migrations.

## Boundaries

The snapshot API is an imported same-origin module **only**. It is not a browser/global Hub API, Account OAuth grant, server endpoint, cross-device read model, or permission to read another origin's IndexedDB. Account and Core remain unchanged. Imported ICS remains a local snapshot. No external calendar is connected in C1.

## Verification gate

Exact-head `npm run typecheck`, `npm run validate:calendar-v2`, focused habit and sync validators, and desktop/mobile interaction tests are required before release. These are not claimed as passed unless executed against the exact commit. This implementation must remain a draft until qualified.

## Next

C2: Google Calendar sync and KLIPS read-only feed through a server-owned authenticated connector with external write and conflict controls.
