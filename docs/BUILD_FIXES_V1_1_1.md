# Folio v1.1.1 — Production build fixes

This note records fixes discovered by the first dependency-backed GitHub Actions release verification on 2026-09-16.

- Made source-hygiene validation CI-aware: generated `node_modules/` may exist after dependency installation, but must not be tracked or shipped.
- Corrected React effect cleanup in the runtime issue subscription so the cleanup callback returns `void`.
- Changed Dexie transactions spanning many tables to the documented table-array form.
- Explicitly typed entity factory IDs as `string` to avoid accidental `crypto.randomUUID()` template-literal narrowing at call sites.
- Added an ES2022 target/library to the Node/Vite TypeScript configuration.
- Hardened patch-analysis handling for create operations whose schema permits an optional reference.

These are release-hardening fixes only. They do not change IndexedDB schema v12 or intentionally alter user-facing product behavior.

The GitHub Pages workflow remains the authoritative release gate: `npm run release:verify` must pass before `dist/` is deployed.
