# D14 — Search V2

D14 replaces Folio's narrow task/note content lookup with one global, local-first search layer.

## Indexed entities

The existing `searchDocuments` IndexedDB table remains the only persistent search index and now represents:

- Tasks
- Notes
- Projects
- Habits
- Saved review records
- Tags

Task documents additionally index:

- Markdown notes
- Checklist text
- Comments
- Legacy and structured tag names
- Project name
- Location and source URL
- Attachment filenames, MIME metadata, and link URLs

Note documents include attachment metadata as well.

## Ranking

Search V2 uses field-aware scoring:

1. Exact title
2. Title prefix
3. Title contains
4. Structured metadata / keywords
5. Summary
6. Full content
7. Typo-tolerant fuzzy match

Recent updates receive a small tie-breaking relevance boost. Search can instead be explicitly sorted by recent update or title.

Search normalization is accent/diacritic-insensitive and Unicode-aware.

## Fuzzy search

Two typo-tolerance paths are used:

- Small edit-distance matching for plausible word typos
- Subsequence matching for incomplete or compressed text

Fuzzy results are deliberately scored below exact field matches.

## Filters

Search V2 supports:

- Entity type
- Project
- Tag
- Open / completed status
- Include archived
- Updated within 7 / 30 / 365 days
- Date from / through
- Relevance / recent / title sorting

Inline query operators are also available:

- `type:task`
- `type:note`
- `status:open`
- `status:completed`
- `is:archived`
- `after:YYYY-MM-DD`
- `before:YYYY-MM-DD`

Quoted multi-word phrases remain a single search token.

## Saved and recent searches

Saved searches store the query plus the complete filter snapshot in Folio settings. Recent searches are recorded when a result is opened. Both therefore remain local-first and are included automatically in normal Folio backups through the existing settings table.

## Result interaction

Results show highlighted exact query terms, entity type, status/date metadata, content snippets, and matched-field information.

Keyboard interaction:

- Up / Down — result selection
- Enter — open selected result
- G → S — open Search workspace

Opening results routes to the existing entity surface rather than a duplicate search-only viewer. Archived notes can deep-open directly into Archived Notes; archived project/habit/tag results route to their existing archive-management surfaces.

## Index freshness

The index is derived, not authoritative. Source counts and latest update timestamps form a fingerprint. Search rebuilds automatically when source state diverges.

Task/note attachment mutations update their owner search document immediately. Permanent task/note deletion explicitly invalidates the in-memory search cache.

## Architecture

D14 stays on **database schema v23**.

No search schema v24 is necessary because `searchDocuments` already stores owner type as an indexed string and supports additional document metadata without changing the IndexedDB key/index layout.

Search remains entirely offline. No backend, network request, or external search service is involved.
