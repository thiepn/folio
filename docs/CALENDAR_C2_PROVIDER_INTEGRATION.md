# THIEPN Calendar C2 — Provider synchronization (draft PR #23)

## Work actually implemented

The native Calendar route remains Folio-backed. C2 adds:

- A KLIPS read-only calendar source manager inside the actual Calendar sidebar: local registration, optional same-tab HTTPS request to `*.uni-koeln.de` when CORS permits, alternative pasted iCal, bounded period selection, change preview, explicit commit, durable reload, removal and source status.
- Weekly and daily RRULE materialization, supported BYDAY, COUNT, UNTIL, EXDATE, cancelled detached occurrences, and separate modified occurrences. Unsupported RRULE variants reject replacement rather than silently deleting classes. Not a general RFC5545 recurrence engine.
- Stable external `UID#occurrence` references, optimistic revision and baseline comparisons, conflict fail-closed, single IndexedDB transaction for source changes, and no background credentials, URLs or ICS bytes persisted. `storage.*` metadata is explicitly excluded from D18 cloud sync.
- External provenance on Folio TimeBlock includes `klips` and `google` alongside historical `folio` and `ics`. External blocks can be copied into Folio but cannot be silently dragged, resized, edited or deleted as if locally owned.
- Google Calendar v3 protocol: paginated `nextSyncToken`, `singleEvents=true`, deletions and 410-expired token signaling, event normalization, stable source keys, full vs incremental reconciliation and pending-write conflict planning, proposed native event exports, conditional patch/delete with ETags, and strict scope/capability prerequisites. Protocol has no direct Google network access and does not read Account sign-in tokens.
- Focused real Node cases are added to the release validator; the automatic Chromium preview workflow now exercises real timetable preview/apply/reload/update and mobile Calendar navigation.

## What is NOT connected

No Google Calendar OAuth client, event scope, refresh token, Core proxy routes, production Google Calendar sync, or push notifications were created. THIEPN Account's existing Google sign-in is **not** permission to access Calendar events. `authorizeGoogleWrite()` only validates a proposed call, never grants permission. Future Core must independently verify Account identity, registered consent, target calendar ownership, and an If-Match ETag before any upstream mutation.

KLIPS addresses are capability secrets. The UI holds them only in memory while explicitly refreshing and does not store the URL in Folio sync/settings/backup; thus C2 is manual or browser-CORS refresh, not reliable server-scheduled synchronization. A future server-owned, allowlisted, token-isolated KLIPS fetch path remains blocked on the reviewed Core/Account managed authorization gates.

## Required future backend contract

The proposed Core gateway should expose authenticated endpoints for calendar source enumeration, OAuth connect/disconnect, Google paged deltas, and individual conditional writes. Core must validate OAuth scopes independently, store upstream credentials encrypted and inaccessible to browsers, restrict CORS exact origins, bound requests, support idempotency keys, sanitize errors, handle revoked consent and cursor expiry, and reconcile after unacknowledged writes. It must never return upstream OAuth secrets or KLIPS subscription URLs to Hub.

## Verification policy

Do not mark live Google two-way or automatic KLIPS polling as PASS until a reviewed Account/Core route, granted calendar scope, disposable provider account, real timetable feed and browser/device acceptance have been demonstrated. Source TypeScript, unit/regression cases and local Chromium acceptance can PASS independently. Main, production, hosted migrations and other apps remain unchanged.
