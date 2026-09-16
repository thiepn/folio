# Final Release — v1.0.0

## Status

Folio is feature-frozen at **v1.0.0** with IndexedDB schema **v12**.

## Final corrections

The final consolidation corrected stale backup UI/documentation that still displayed schema v11 after the data model had advanced to v12. The runtime now reports:

- full backup schema: **v12**;
- directly restorable compatible schemas: **v8–v12**;
- dependency relationships/cycles included in backup semantic validation.

The obsolete internal “Phase 8+ build” wording was also removed from the user-facing old-backup error.

## Validation performed

- final release source contract: **44/44 PASS**;
- Phase 21 visual/source contract before cleanup: **62/62 PASS**;
- release-hardening source audit before cleanup: **10/10 PASS**;
- TS/TSX/Vite transpilation syntax scan: **152/152 files, 0 diagnostics**;
- relative source imports: **PASS**;
- UI/features → direct IndexedDB access: **0 violations**;
- public JSON schemas/manifest: **parse successfully**;
- CSS rule-brace integrity: **PASS across all 8 stylesheets**;
- database schema: **v12**.

## Build note

The generation environment could not resolve `registry.npmjs.org` (`EAI_AGAIN`), so it could not install the third-party npm packages needed to execute the dependency-backed Vite production build here. This is an environment/network limitation and is not represented as a successful build.

On a normal Node environment:

```bash
npm install
npm run validate:final
npm run typecheck
npm run build
```

After the first successful install, commit `package-lock.json` and use `npm ci` for reproducible subsequent builds.
