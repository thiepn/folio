# Accessibility, Performance & Reliability Contract

## Accessibility target

The product is hardened toward **WCAG 2.2 AA behavior**. Phase 20 does not claim formal WCAG certification without manual assistive-technology and built-browser testing.

### Required behaviors

1. Every primary destination is keyboard reachable without a pointer.
2. Keyboard focus is always visible.
3. Dialogs own focus while open and restore it on close.
4. Escape closes only the top-most interactive overlay.
5. View changes have programmatic context through focus/title/live announcement.
6. User zoom is not disabled.
7. Core layouts must survive large text without accidental horizontal page scrolling.
8. Reduced-motion preference suppresses nonessential transitions/animations.
9. High-contrast/forced-colors users retain visible controls, current state and focus.
10. Functional text does not depend on arbitrary raw user accent contrast.
11. Color is not the sole indicator of critical status where text/shape can express it.
12. Mouse/touch equivalents remain available for keyboard accelerators.

## Performance contract

Performance work should reduce redundant work before introducing virtualization or architectural complexity.

### Main-workspace rule

One reactive Task snapshot + one Project snapshot should be sufficient to derive the common application shell datasets.

Avoid adding a new `useLiveQuery` or repository table scan merely to create another filtered version of the same Task collection.

### Synthetic smoke budget

The dependency-free Phase 20 validator constructs 25,000 representative Task rows and performs common filter/sort/group operations.

The threshold is deliberately broad (`<750ms` in Node) and is a regression tripwire, not a device benchmark.

### Runtime diagnostic bands

Core local query probe:

- `<=150ms` — fast;
- `151–600ms` — acceptable;
- `>600ms` — slow / investigate database size and query regressions.

These are diagnostic labels, not promises for every device.

## Reliability contract

### Never reset on ordinary failure

Neither:

- render errors;
- async errors;
- unsupported optional PWA features;
- integrity warnings

may automatically delete or reset IndexedDB.

### Database boot

Core browser capability is checked first. Then database open/migration/seed/reconciliation occurs. If database initialization fails, the existing recovery-first FatalRecoveryState is used.

### Render failure

After successful database boot, React render failures are caught by AppErrorBoundary and offer reload + emergency backup.

### Async failure

Unhandled async/window failures are surfaced while leaving the current local workspace intact.

### Diagnostics remain read-only

Reliability checks may read/validate/query data but may not mutate Tasks, Projects, Habits, Calendar, Focus or planning state.
