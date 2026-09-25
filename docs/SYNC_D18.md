# D18 — Sync

D18 adds real multi-device synchronization while preserving Folio's local-first behavior.

## Architecture

Every device continues to use its own IndexedDB database as the primary working store.

Cloud sync is an authenticated replication layer, not a replacement database:

`IndexedDB → local diff queue → Supabase → other device → IndexedDB`

Folio remains usable while signed out, offline, or while the cloud is unavailable.

## Local schema v24

D18 adds three operational stores:

- `syncShadows` — the cloud revision/hash this device last accepted for an entity
- `syncQueue` — local upserts/deletes that differ from the accepted baseline
- `syncConflicts` — concurrent local/cloud edits requiring an explicit winner

These tables contain sync mechanics only and are not planner content.

## Cloud backend

D18 uses the existing THIEPN Core Supabase project in isolated tables:

- `public.folio_sync_workspaces`
- `public.folio_sync_devices`
- `public.folio_sync_records`

The existing `vault_*` tables are not modified.

All Folio sync tables:

- Have Row Level Security enabled
- Are available only to `authenticated`
- Restrict rows to `auth.uid() = user_id`
- Use the browser-safe Supabase publishable key
- Never expose a secret/service-role key

A Postgres sequence assigns monotonic record revisions. A SECURITY INVOKER trigger updates the revision and server timestamp on every remote record write.

## Authentication

Folio Sync supports Supabase email/password authentication.

The sync session is stored only in browser localStorage under:

`folio:sync-auth:v1`

Access/refresh tokens are intentionally excluded from IndexedDB and Folio JSON backups.

If email confirmation is enabled in Supabase, account creation reports that confirmation is required before sign-in.

## Cloud workspaces and devices

A signed-in user may create or select a cloud workspace.

Each device has a stable device ID and editable device name. Successful syncs update a remote device-presence row with the current user agent and last-seen time.

A second device signs into the same Folio Sync account and connects to the same cloud workspace.

## Syncable data

D18 synchronizes canonical planner state:

- Tasks
- Projects
- Habits and habit entries
- Habit groups/templates
- Time blocks/events
- Daily Plans and Plan Items
- Focus sessions
- Recurring Series
- User settings
- Reviews
- Reminders and occurrences
- Folders, Lists, Sections, Tags
- Notes
- Attachments

Derived search documents, AI import/patch provenance, calendar-import batches, and sync metadata are not replicated.

Device-operational settings beginning with `sync.`, `storage.`, or `pwa.` are not synced.

## Attachment boundary

Binary attachments up to **5 MB per file** are synchronized through portable base64 payloads.

Larger files remain explicitly device-local. Their task/note metadata still syncs normally and the Sync workspace shows a warning count.

A large device-local attachment is never overwritten by a remote attachment update/delete merely because its binary payload was excluded.

## Sync algorithm

Each run is deliberately remote-first:

1. Authenticate / refresh session
2. Register device presence
3. Pull remote records after the local revision cursor
4. Apply non-conflicting remote changes
5. Compare current local state with accepted sync shadows
6. Queue local upserts and tombstone deletes
7. Push queued changes using conditional base revisions
8. Pull again to observe newly committed revisions
9. Rebuild derived search/attachment state
10. Re-scan local state and update status

This avoids treating a stale local snapshot as authoritative on reconnect.

## Conflict detection

Every remote row has a monotonically increasing revision.

A local push contains the revision the device last accepted. Existing remote rows are patched only when that revision still matches.

If another device changed the record first, the conditional push affects zero rows and Folio fetches the current remote row instead.

Concurrent identical payloads auto-resolve.

Different payloads create a local `syncConflicts` record.

Folio does **not** silently use last-write-wins.

## Conflict resolution

The Sync workspace presents both sides:

- **Keep this device** — conditionally pushes the current local value using the latest remote revision
- **Use cloud** — applies the remote payload locally and updates the accepted baseline

If cloud changes again during a local-wins resolution, Folio keeps the conflict open with the newest cloud version.

## Deletions

Once a previously synchronized local row disappears, D18 queues a remote tombstone.

Remote tombstones delete the corresponding local canonical entity.

The tombstone remains in the remote record table so devices that were offline still learn about the deletion later.

## Offline and retries

When offline:

- Folio continues operating entirely from IndexedDB
- Local changes are discovered into the pending queue on the next sync cycle
- No data-entry feature is blocked

Background sync wakes on:

- Network online
- Window focus
- `pageshow`
- Document visibility
- 30-second interval

Failures use bounded exponential backoff up to five minutes. Manual **Sync now** bypasses the wait.

## Recovery

The Sync workspace exposes **Reset device sync state**.

This clears only:

- Shadows
- Queue
- Conflicts
- Pull cursor

It does not delete local planner content or cloud content. The next run performs a fresh merge.

## Backup boundary

Schema v24 backups include canonical planner data but exclude all `sync.*` settings.

Restore clears local shadows, pending queue, and conflicts.

This prevents a restored backup from inheriting stale cloud credentials or revision cursors from another device.

## Security

The frontend contains only the Supabase publishable key, which is designed for public browser clients.

The service-role/secret key is never used.

Supabase security advisors report no Folio sync RLS findings after the D18 backend migration.

## Navigation

Sync is available through:

- Desktop sidebar
- Mobile More
- Command palette
- `G → Y`

## Provider boundary

D18's app-side logic separates:

- Auth
- Cloud transport
- Local serialization
- Sync coordinator

The current transport is Supabase, but IndexedDB planner logic does not depend directly on Supabase APIs.
