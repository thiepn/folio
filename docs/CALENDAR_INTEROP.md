# Calendar Interoperability Contract

## Export rules
Only exact calendar objects are exported to `.ics`:
- Task-linked TimeBlocks → VEVENT;
- standalone Event TimeBlocks → VEVENT when enabled.

An unscheduled or merely date-planned Task is **not** a VEVENT. PlannedDate remains planner intent, not a claim that exact calendar time exists.

All exported DTSTART/DTEND values use UTC `Z`. This preserves the instant across time zones and DST changes. Receiving calendar software renders the instant in its own configured zone.

Standalone Event TimeBlocks preserve optional `description` and `location`; these map to iCalendar `DESCRIPTION` and `LOCATION` and remain editable after import.

Task-linked VEVENTs include:
- `X-FOLIO-KIND`
- `X-FOLIO-TIMEBLOCK-ID`
- `X-FOLIO-TASK-ID`
- optional `X-FOLIO-PROJECT-ID`

## Import rules
External timed VEVENTs become standalone Event TimeBlocks. `SUMMARY`, `DESCRIPTION`, and `LOCATION` are preserved when present.

They never:
- create a Task;
- set plannedDate/deadline;
- complete work;
- create a Project;
- create a RecurringSeries.

### Time parsing
Supported:
- UTC: `20260820T120000Z`
- floating local: `20260820T140000`
- IANA TZID: `DTSTART;TZID=Europe/Berlin:20260820T140000`

TZID conversion is calculated with `Intl.DateTimeFormat` and verified by round-trip. A nonexistent local time during a DST spring-forward gap is rejected.

### Explicitly skipped
- `VALUE=DATE` / all-day events: no all-day primitive exists yet.
- VEVENT with `RRULE`: Phase 15 does not invent recurrence semantics from external calendars.
- cancelled events.
- cross-midnight events: current TimeBlock UI/model expects a single local day.

`RECURRENCE-ID` is incorporated into the import source key for materialized recurring instances.

## Duplicate protection
A timed Event is considered already imported when an applied batch contains the same UID/instance source key or fingerprint. Exact title/start/end matches against existing standalone Events also count as duplicates.

Duplicates are shown in Preview and not imported. Duplicate checks run again inside the Apply transaction.

## Conflict protection
Overlap is not equivalent to duplication. Preview lists conflicting block titles, but Apply allows overlaps after Preview because legitimate calendars can contain simultaneous commitments.

## Provenance and Revert
Every imported Event stores its original TimeBlock snapshot inside CalendarImportBatch. Revert is allowed only while each imported Event still exactly matches that snapshot. If the user later edits or deletes one, Revert refuses to proceed.
