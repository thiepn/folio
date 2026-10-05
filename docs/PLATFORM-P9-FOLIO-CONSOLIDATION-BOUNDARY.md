# Platform P9 — Folio Consolidation Boundary

P9 makes Folio the product boundary for personal productivity, knowledge, reading, writing, notes and visual work **without** pretending the existing repositories and stores have already been merged.

## Canonical product shape

P8 remains authoritative for the public Folio module identities:

- `folio/home`
- `folio/knowledge`
- `folio/library`
- `folio/write`
- `folio/notes`
- `folio/canvas`

The legacy aliases remain frozen:

- `folio → folio/home`
- `knowledge → folio/knowledge`
- `library → folio/library`
- `manuscript → folio/write`
- `notes → folio/notes`
- `canvas → folio/canvas`

P9 does not change those identities.

## What Folio owns now

The existing `thiepn/folio` application remains the canonical owner of its native productivity domains:

- tasks and Inbox;
- projects;
- lists/sections/tags used by native Folio work;
- planning/calendar;
- habits;
- focus/time tracking;
- reviews;
- automation.

Its existing IndexedDB database remains `folio`. No P9 migration rewrites that database.

The current Folio-local `NoteEntity` is retained for compatibility as home/context content. P9 does **not** silently move or duplicate those records into the separate Notes provider.

## Provider-owned modules during consolidation

### Notes — `folio/notes`

`thiepn/notes` remains the canonical provider for the existing Notes application's personal notes, attachments, search state and sync state. Folio may link/read through future bounded adapters, but P9 does not proxy writes or copy its database.

### Library — `folio/library`

`thiepn/library` remains canonical for books, reader state, bookmarks, highlights, reading notes and library metadata. EPUB/PDF bytes remain device-local under Library's existing architecture; Folio and Core do not become a binary store.

### Write — `folio/write`

`thiepn/manuscript` remains canonical for manuscript/document authoring state and exports until a later UI/storage migration is explicitly certified.

### Canvas — `folio/canvas`

Canvas belongs to the Folio product family at the navigation/product layer, but its runtime boundary does **not** collapse into private Folio/Core storage. Existing public/realtime ownership remains isolated.

### Knowledge — `folio/knowledge`

Knowledge is intentionally staged. P9 does not create a Knowledge database, invent a production URL, or select a new storage owner merely to make the architecture look complete.

## Shared references, not shared databases

Cross-module identity belongs to the shared Core protocol. P9 uses Resource URI v1:

`thiepn://<product>/<module>/<kind>/<percent-encoded-id>?v=1`

A resource URI is an opaque identifier only. It is not authentication, authorization, existence proof or permission to copy data.

Example:

`thiepn://folio/library/highlight/book%3Aabc%2F42?v=1`

The Library provider still owns the highlighted record and decides whether the current account may read, update or delete it.

## Migration sequence

For each external Folio module:

1. keep the provider/store canonical;
2. expose the module behind the Folio product identity;
3. add bounded references/read models where useful;
4. move navigation/UI independently from data;
5. migrate data only with a product-specific migration and rollback plan;
6. retire legacy URLs/IDs only after deep links, account behavior, sync, export, restore and rollback are certified.

This avoids a destructive big-bang rewrite.

## Explicit P9 non-goals

P9 does not:

- merge repositories;
- merge databases;
- add a second auth system;
- centralize product data in Core;
- rewrite existing Notes/Library/Manuscript/Canvas storage;
- move Canvas into private Core;
- invent Knowledge persistence;
- change existing production URLs;
- delete legacy app IDs;
- redesign the complete Folio UI.

The visible single-workspace Folio experience is a later migration over this boundary.
