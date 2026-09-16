# Folio Rebrand Contract

Folio is the current product identity. The previous product name is retired from all user-facing UI, PWA metadata, generated exports, calendar metadata, structured protocols, documentation headings, package metadata, and release packaging.

## Current identifiers

- App / PWA: `Folio`
- npm package: `folio`
- IndexedDB: `folio`
- backup format: `folio-backup`
- selective export: `folio-selection`
- structured import: `folio-import`
- structured patch: `folio-patch`
- calendar extension properties: `X-FOLIO-*`
- repository: `thiepn/folio`

## Compatibility

The runtime intentionally retains a small isolated set of legacy identifiers only for migration. On first launch, an existing pre-Folio IndexedDB workspace is copied into `folio`, verified by table counts, and only then is the old database removed. Previous appearance and last-view localStorage settings are also migrated.

Older backup, structured-import, and structured-patch JSON formats remain accepted and normalize to Folio in memory. New exports always use Folio identifiers. The service worker also removes caches left by the pre-Folio build during activation.

No IndexedDB schema change is introduced: the schema remains v12.
