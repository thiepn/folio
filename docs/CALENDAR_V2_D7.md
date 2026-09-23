# D7 — Calendar V2

D7 turns Folio's exact-time calendar into a full scheduling workspace while preserving the separation between planned dates, deadlines, and clock blocks.

## Calendar views

Calendar V2 provides:

- Agenda;
- Day;
- 3 Day;
- Week;
- 4 Week;
- Month;
- Year.

Day/3 Day/Week are exact-time grids. 4 Week/Month are date matrices. Year is a twelve-month overview. Agenda is a chronological event list.

## Time model

Task `plannedDate` remains an intention date. A TimeBlock is a concrete clock reservation. Deadlines remain separate.

Scheduling a task creates a TimeBlock and does not rewrite its estimate or deadline.

Multiple task sessions are supported, so a three-hour task can be split across several blocks.

## Time zones

Timed calendar display uses a selected IANA time zone. Creating, moving and editing blocks converts requested wall-clock times through D2's timezone/DST helpers.

Recurring work blocks store their series timezone. Imported ICS events preserve their source TZID when supplied.

All-day events are anchored to their own calendar timezone so changing the display timezone cannot shift their logical dates.

## DST

D7 reuses D2's `atTimeInZone()` behavior:

- fall-back overlaps resolve deterministically;
- spring-forward gaps advance to the first valid wall-clock minute.

## All-day events

Standalone events may be all-day and may span multiple dates. Their end date is exclusive, matching iCalendar semantics.

All-day items render in a dedicated lane rather than occupying clock time or creating timed conflicts.

## Multi-day timed events

Timed events may cross midnight. A block is included in every calendar date it touches and is rendered as the relevant segment on each day.

Repository range queries use overlap semantics (`start < rangeEnd && end > rangeStart`) so events beginning before the visible range are still loaded when they span into it.

## Overlapping blocks

Timed overlaps are assigned deterministic columns within each overlap cluster. Conflicting blocks render side-by-side instead of drawing directly over one another.

All-day items do not participate in clock-conflict detection.

## Scheduling sidebar

The calendar sidebar includes:

- a mini-calendar;
- selected-day tasks needing time;
- all tasks needing additional scheduled time;
- every D6 Smart View as a live task source;
- text filtering;
- remaining estimate after existing work blocks.

Dragging a task into an exact-time grid opens one scheduling session at the dropped time.

## Drag / resize / copy

Desktop calendar interactions support:

- task → timed calendar drag;
- block move between dates/times;
- drag into month/4-week dates;
- resize duration;
- Alt-drag copy;
- all-day item moves;
- all-day/timed duplication through the event editor.

Mobile keeps explicit Schedule/Edit controls rather than depending on HTML drag/drop.

## Current-time line

The Day/3 Day/Week grid displays a live current-time line in the selected calendar timezone and refreshes it every 30 seconds.

## Working-time summary

Calendar V2 summarizes selected-day:

- task minutes scheduled;
- planned work still needing time;
- daily capacity;
- open clock time between 06:00 and 22:00;
- all-day count;
- timed conflicts.

The grid itself remains 24-hour so overnight work remains representable.

## iCalendar interoperability

D7 expands local ICS support:

- timed events;
- cross-midnight timed events;
- all-day `VALUE=DATE` events;
- source calendar name;
- source UID/instance identity;
- timezone metadata;
- all-day export.

Imported events retain provenance in the TimeBlock model. Import remains a local snapshot; continuous Google/Outlook/provider synchronization remains D17.

RRULE expansion for arbitrary external recurring calendars is deliberately not implemented in D7. Folio's own recurring task blocks are already materialized by D2 and appear normally in Calendar V2.

## Event editor

Standalone events can edit:

- title;
- timed versus all-day;
- date/time;
- all-day date span;
- duration;
- calendar timezone;
- location;
- notes.

Imported event provenance is shown in the editor. Existing events can be duplicated.

## Structured Import / Patch

Folio Import v1 and Patch v1 support:

- `allDay`;
- `endDateExclusive`;
- `timeZone`;
- description;
- location

for calendar TimeBlocks. Public JSON schemas are aligned with runtime validation.

## Persistence

D7 does **not** advance IndexedDB. Folio remains schema **v19** because the additional TimeBlock properties are optional non-indexed fields.

Normal v19 backup validation preserves:

- all-day state;
- timezone;
- local/ICS source type;
- source calendar;
- source UID.

## Deliberate boundaries

D7 does not implement continuous external-provider synchronization, shared calendars, server-side push, or arbitrary remote RRULE expansion. Those belong to D17 Integrations / later cross-device infrastructure.

## Next

**D8 — Kanban & Timeline** can now reuse D5 organization, D6 query sources and D7 date/time semantics for board and timeline planning.
