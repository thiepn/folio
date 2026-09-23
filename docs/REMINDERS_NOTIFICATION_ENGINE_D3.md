# D3 — Reminders & Notification Engine

D3 adds a durable reminder subsystem to Folio on top of the D2 date engine.

## Architecture

Reminder state is split into two canonical layers:

- `ReminderEntity` — a reusable reminder definition;
- `ReminderOccurrenceEntity` — one concrete scheduled/due/snoozed/dismissed delivery instance.

This separation prevents snoozing one recurring alert from mutating every future alert.

## Reminder owners

Definitions can belong to:

- a single task;
- an entire recurring series;
- a fixed-schedule habit;
- a Folio system workflow.

Series-owned definitions automatically follow materialized recurring task occurrences, so future recurring tasks inherit the reminder behavior without copying reminder metadata into every task.

## Task reminder anchors

Tasks support multiple simultaneous reminders anchored to:

- planned date at a chosen wall-clock time;
- deadline at a chosen wall-clock time;
- calendar block start/end with a minute offset;
- an exact timestamp.

Planned/deadline reminders may use day offsets. Calendar-block reminders can be relative in minutes. Exact timestamp reminders are intentionally occurrence-scoped rather than series-scoped.

## Habit reminders

Daily, weekday, and selected-weekday habits can have one or more reminder times. Paused dates, completed dates, skipped dates, and archived habits suppress delivery.

`times-per-week` habits intentionally do not invent fixed reminder days because their schedule is flexible by definition.

## System reminders

D3 provides optional:

- Daily planning reminder;
- Overdue-task summary.

The overdue summary is suppressed when there are no unfinished root tasks past deadline. Daily planning is suppressed once that day's plan is already committed.

## Occurrence lifecycle

`scheduled → due → dismissed`

or:

`scheduled/due → snoozed → due → dismissed`

Disabled/deleted/inapplicable definitions cancel future occurrences. Due state remains durable in IndexedDB and is shown in the Reminder Center even when system-notification permission is unavailable.

## Missed-reminder policy

One-shot task reminders retain a lookback window so a reminder missed while Folio was closed can be surfaced on reopen.

Recurring daily/habit/system reminders do not replay a multi-day backlog. Folio materializes today's recurring alert plus future alerts, preventing a notification storm after a long absence.

## Notification delivery

With browser permission, Folio uses `ServiceWorkerRegistration.showNotification()` when possible and falls back to the window Notification API.

Notifications can expose:

- Snooze 10m;
- Dismiss;
- body-click/open behavior.

Service-worker notification clicks route back into Folio through stable reminder occurrence IDs. URL actions are consumed before asynchronous processing so React StrictMode cannot execute the same notification action twice.

Persistent reminders request `requireInteraction` where the platform supports it.

## Runtime scheduler

While Folio is running, the reminder scheduler:

1. reconciles definitions into concrete occurrences;
2. calculates the nearest wake-up;
3. checks due occurrences;
4. suppresses alerts whose owner is already complete/inactive;
5. emits system notifications when permitted;
6. retains in-app due state;
7. re-arms for the next reminder.

The runtime rechecks on focus, visibility return, network return, and reminder changes. Listener teardown is StrictMode-safe.

If a reminder becomes due before notification permission is granted, its in-app due state remains. After permission is later granted, Folio can still deliver the not-yet-system-delivered alert once.

## Browser boundary

A local-only web application cannot universally guarantee an exact wake-up after the browser fully terminates the PWA. Periodic Background Sync is not a cross-browser exact alarm scheduler. D3 therefore keeps the canonical schedule exact and:

- delivers while Folio is alive/backgrounded when the browser permits execution;
- reconciles missed reminders immediately on reopen/focus;
- never claims a terminated-app guarantee it cannot provide.

A future push/native layer can provide stronger terminated-app delivery without changing D3's reminder definitions or occurrence lifecycle.

## Persistence

IndexedDB advances from **v17 to v18** with:

- `reminders`;
- `reminderOccurrences`.

Full backup/restore includes both tables. Direct restore compatibility remains **v8–v18**; older backups normalize reminder collections to empty arrays.

## Deliberate boundaries

D3 does not implement:

- location/geofence reminders, because browsers do not provide a reliable local-first background geofencing primitive;
- email reminders, which require a server/provider;
- push-based terminated-app scheduling, which belongs with a later backend/sync/device-integration layer;
- NLP reminder extraction, which belongs to D4 Capture/NLP.

## Next

**D4 — Capture Engine V2 & Natural-Language Quick Add** can now parse reminder phrases into the stable D3 reminder model rather than inventing another alert representation.
