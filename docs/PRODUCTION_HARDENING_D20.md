# D20 — Production Hardening

D20 is the final feature-freeze phase for the current Folio source. It does not add product scope and does not change IndexedDB schema v24. Its purpose is to make the completed D1-D19 product safer to build, deploy, update, recover, and verify.

## Production guarantees added

### Deterministic and lower-trust CI

Both GitHub Actions workflows install from the committed lockfile with `npm ci --ignore-scripts --no-audit --no-fund`.

All first-party GitHub Actions used by Folio are pinned to full commit SHAs rather than mutable major-version refs. Checkout uses `persist-credentials: false`, so build steps do not retain the repository write credential.

The Pages build job has only `contents: read`. `pages: write` and `id-token: write` are isolated to the deployment job.

### Artifact-level release manifest

The old checked-in `RELEASE_MANIFEST.json` was stale and still described schema v15, so it is removed as a source file.

Every production build now generates `dist/release-manifest.json`. It derives the current database schema from `src/db/database.ts`, records the package version and CI source commit when available, and includes the byte size and SHA-256 digest of every deployed file.

`validate:dist` independently recomputes the deployed file set, byte counts, per-file hashes, and aggregate artifact digest before deployment.

### Service-worker cache lifecycle hardening

Runtime caches are revision-scoped instead of sharing one permanent runtime cache. Activation removes runtime caches from older releases together with superseded app-shell caches.

Cache writes are best-effort. A quota error, private-mode restriction, or browser cache-policy failure can no longer convert a successful network response into a failed application request. Partial HTTP responses are not persisted into the same-origin runtime cache.

### Startup degradation instead of unnecessary lockout

Opening and migrating the primary IndexedDB database remain fatal requirements. Derived startup maintenance is recoverable:

- recurring-task materialization;
- active Focus reconciliation;
- storage-safety initialization;
- orphan-attachment cleanup;
- search-index rebuild;
- daily automation execution.

If one of those steps fails, Folio reports a runtime recovery issue and continues to the workspace instead of replacing the whole application with the fatal database-recovery screen.

No automatic reset is introduced. Destructive recovery still requires two explicit confirmations.

### Recovery and documentation corrections

The fatal-recovery reset prompt now states that reset recreates an empty Folio workspace rather than the obsolete prototype-workspace wording.

Current documentation identifies schema v24, v8-v24 direct backup compatibility, and `npm ci` as the reproducible install path.

## Release gate

`npm run release:verify` runs all existing release and D1-D19 contracts, then D20, then performs the typechecked production build, generates the artifact manifest, and validates the complete `dist` output.

The D20 validator checks package-lock/package.json agreement, workflow install determinism, pinned action SHAs, least-privilege permissions, service-worker cache safety, recoverable maintenance boot semantics, current schema documentation, manifest verification wiring, and absence of the obsolete checked-in release manifest.

## Certification boundary

The automated gate certifies source invariants, TypeScript, production build output, deployment packaging, cache lifecycle rules, and artifact integrity. It does not claim physical-device or assistive-technology certification.

The rendered D19 browser/mobile/accessibility items should still be checked manually on representative Chromium, Firefox, Safari/WebKit, mobile/touch, keyboard-only, and screen-reader combinations when those environments are available.

## Exit condition

D20 is complete when the final commit passes `npm run release:verify` in GitHub Actions and the verified Pages artifact deploys successfully from `main`.
