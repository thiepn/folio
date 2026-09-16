# Folio v1.1.1 — Release & GitHub hardening

This patch release does not add product scope. It establishes a repeatable release gate for the Folio source and GitHub Pages deployment.

## Release gates

A release candidate must pass all of the following:

1. `npm run validate:final`
2. `npm run validate:release`
3. `npm run typecheck`
4. `npm run build`
5. `npm run validate:dist`

`npm run release:verify` runs the full sequence.

## Data-safety gates

Before treating a deployment as certified for daily use:

- create a native Folio JSON backup;
- restore that backup into a clean test workspace and compare entity counts;
- verify a pre-Folio/legacy workspace migrates into the `folio` IndexedDB database;
- verify the legacy database is retained if migration verification fails;
- verify a legacy backup/import/patch payload is accepted and normalized;
- verify fresh installs remain blank unless the user explicitly loads the demo workspace.

The v1.1.1 patch does not change IndexedDB schema v12.

## GitHub Pages

The deployment workflow builds and verifies Folio before publishing `dist/`. The Vite base, manifest URLs, and service-worker registration remain relative so the app works from the repository subpath `/folio/`.

### One-time repository setting

GitHub requires Pages to be enabled for the repository before the official Pages deployment action can publish. In `thiepn/folio`:

**Settings → Pages → Build and deployment → Source → GitHub Actions**

This is a one-time repository setting. Subsequent pushes to `main` run `.github/workflows/deploy-pages.yml` automatically.

Expected public URL: `https://thiepn.github.io/folio/`

## Workflow policy

- Pull requests: `.github/workflows/ci.yml` performs the complete release verification and uploads the built `dist/` artifact for inspection.
- `main`: `.github/workflows/deploy-pages.yml` performs the same release verification, then deploys only the verified `dist/` directory.
- Workflow permissions are read-only except for the Pages deployment permissions required by GitHub (`pages: write`, `id-token: write`).
- Concurrency prevents stale Pages deployments from racing newer commits.

## Dependency policy

Direct dependencies are pinned to exact versions in `package.json`. A committed npm lockfile remains preferable once generated in a network-enabled development environment; CI intentionally disables setup-node package-manager caching until a lockfile exists.
