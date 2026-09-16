# PWA, Offline & Storage Safety Contract

## Offline guarantee
After a production service worker has successfully installed its precache, the application shell required to open Folio is available without network access. Core planner data remains in IndexedDB and all core engines run locally.

The guarantee does not mean every decorative third-party resource is bundled. Google Fonts are optional; if unavailable, CSS fallbacks render the interface without affecting data or behavior.

## App-shell caching
Production build emits one versioned cache containing:
- `index.html` / root navigation shell;
- hashed Vite JS/CSS output;
- manifest;
- PWA icons;
- offline fallback.

Same-origin non-precache GET assets use runtime caching. Font-provider requests use optional cache-first runtime caching and never gate service-worker installation.

## Update invariant
**Never mix app-shell versions.**
- Active service worker serves its own cached shell.
- New worker precaches the entire new shell.
- New worker waits.
- UI announces update.
- User chooses **Update now**.
- Waiting worker receives `SKIP_WAITING`.
- On controller change the page reloads once into the new complete cache.

Focus state is persisted separately, so this controlled reload does not erase active tracked time.

## Development behavior
Service-worker registration is disabled under Vite development mode. This prevents stale production caches from corrupting local development. Offline/install tests must use `npm run build` followed by a static/preview deployment under HTTPS or localhost.

## GitHub Pages behavior
The app uses:
- Vite `base: './'`;
- manifest `start_url: './'`;
- manifest `scope: './'`;
- service worker URL resolved from `import.meta.env.BASE_URL`;
- `public/.nojekyll`.

No hardcoded repository name or origin is required.

## Browser storage safety
### Persistent storage
The UI may call `navigator.storage.persist()` after explicit user action. A granted result reduces browser eviction risk. Browsers can deny it based on policy/engagement and some browsers do not implement it.

### Quota
`navigator.storage.estimate()` supplies origin-level usage and quota where available. Values are advisory and browser-defined.

### Backups
Backups remain the only portable disaster-recovery mechanism. Default reminder cadence is seven days and can be changed to 3/7/14/30 days. Dismissing the reminder until tomorrow does not falsely mark a backup as complete.

## Recovery policy
Database initialization failure must never trigger an automatic reset. Emergency export is attempted before destructive reset, and reset requires two confirmations.

## Offline fallback
`offline.html` exists only for the exceptional state where the browser navigates offline before the production shell finished precaching. It explicitly states that IndexedDB data was not deleted and asks the user to reconnect once to finish installation.
