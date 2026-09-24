# D16 — Collaboration & Sharing

D16 adds explicit local-first handoff and collaboration packages to Folio.

It does **not** pretend Folio has account-backed cloud collaboration, synchronized permissions, or real-time multiplayer. Instead, D16 makes portable sharing first-class and honest about its boundaries.

## Share package

Folio share packages use:

- `format: "folio-share"`
- `version: 1`
- A unique package/share ID
- Created timestamp
- Scope
- Access boundary
- Optional handoff note
- Self-contained payload

Supported scopes:

- Task tree
- Project
- List
- Saved review
- Template

## Access boundaries

### View only

The receiver may:

- Preview the package
- Read the handoff note
- Copy the readable summary
- Re-share/download the package

Folio disables import for view-only packages.

This is a product boundary inside Folio, not cryptographic DRM. A JSON recipient can always inspect the file outside the app.

### Copy allowed

The receiver first previews the package and then explicitly imports a new local copy.

There is no live link back to the sender. After import, the copied entities belong to the receiver's local workspace.

## Context included

Task, project, and list packages include their relevant task hierarchy.

Linked standalone Notes created from those tasks are included as context.

Attachments are optional. When enabled, binary attachment payloads are embedded as base64 in the JSON package. The UI clearly warns that this increases package size.

Task/project/list imports remap IDs so the receiving workspace never reuses the sender's entity IDs.

Relationships remapped during import include:

- Parent / nested task relationships
- Project ownership for project packages
- List ownership for list packages
- List section IDs
- Note → source task links
- Attachment → task/note owner links

External project/list/recurrence/dependency relationships that are not part of the package are not recreated.

## Project packages

A project package includes:

- Project metadata
- Current milestones
- Non-deleted, non-cancelled project tasks
- Nested task hierarchy
- Linked Notes
- Optional attachments

Import creates a fresh project ID, fresh milestone IDs, and fresh task IDs.

## List packages

A list package includes:

- List metadata
- Its sections
- Tasks in that list
- Linked Notes
- Optional attachments

Import creates a new list, remaps section IDs, and creates new task IDs.

## Reviews

Saved reviews can be shared as read-only snapshots or copyable packages.

Imported reviews become a separate local review with a fresh ID and a "shared copy" title suffix.

## Templates

Task and project templates can be shared.

Imported templates become local custom templates, even if the sender shared one of Folio's built-in definitions.

## Share surfaces

D16 supports:

- Browser / OS Web Share API when available
- File-sharing through a generated `.json` package
- Download fallback
- Copy readable Markdown summary
- Copy raw package JSON

When a browser cannot share files, Folio falls back to sharing text or downloading the package.

## Receive flow

Packages are never imported directly from file selection.

The flow is:

1. Load a `.json` package or paste JSON
2. Validate and preview
3. Show scope, access boundary, counts, handoff note, warnings, and readable summary
4. Import only when the package explicitly allows copying
5. Register an Undo mutation for imported entities

Share-package text is limited to 60 MB for preview safety.

## Failure and undo behavior

Copy imports track every newly created task, note, attachment, section, list, project, review, or template.

If import fails partway through, D16 rolls back created entities.

Successful imports return one Folio Undo action that removes the imported copy.

## Share history

Folio stores a local collaboration history:

- Sent / received
- Package ID
- Scope
- View / copy boundary
- Shared / viewed / imported state
- Timestamp

The history is capped at 100 entries and can be cleared.

It lives in the existing Settings table under:

`collaboration.history.v1`

Therefore it is included in ordinary full backups.

## Architecture

D16 remains on **database schema v23**.

No server, account, remote database, or schema v24 is introduced.

The feature is a portable collaboration layer on top of Folio's existing local-first data model.
