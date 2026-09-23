# D9 — Notes, Rich Task Content & Attachments

D9 extends Folio's task engine with a local-first content layer without turning Folio into a general PKM.

## Shipped

- Markdown-rich task descriptions with edit and Reading modes.
- Safe React rendering: headings, ordered/unordered lists, quotes, fenced and inline code, links, bold text, and embedded interactive Markdown checkboxes.
- Standalone Notes workspace with task/note conversion paths.
- Image, audio, general file, and link attachments.
- IndexedDB Blob persistence, metadata, image dimensions, open/preview/download/remove controls, drag-and-drop and paste ingestion.
- Browser quota checks with write headroom and startup orphan cleanup.
- Derived offline content-search index spanning tasks, notes, attachment names, MIME types, and link URLs.
- Backup/restore and selective-export support for Notes and base64-encoded attachment payloads.
- Schema v21 migration that seeds the task content index while leaving existing task Markdown in the canonical task description field.

## Data model

Task Markdown remains in `TaskEntity.description` for compatibility. Standalone notes use the `notes` table. Binary/link attachments use the `attachments` table keyed by `ownerType + ownerId`. Search documents are derived data and are rebuilt on initialization and after restore.

## Safety invariants

Raw HTML is never injected by the Markdown renderer. Link rendering allows only HTTP, HTTPS, and mailto protocols; link attachments accept HTTP(S). Attachments are retained for soft-deleted tasks, deleted with permanent task/note deletion, and removed by orphan cleanup only when their owner no longer exists.

## Portability

Schema v21 full backups encode Blob payloads as base64 and reconstruct them on restore. The search index is intentionally omitted from backups because it is derived and rebuilt from canonical task/note/attachment state.
