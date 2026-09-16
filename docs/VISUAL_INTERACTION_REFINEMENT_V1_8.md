# Folio v1.8 — Visual & Interaction Refinement

## Release intent

Make Folio feel like a distinctive editorial productivity application rather than a generic dark React dashboard, while preserving the complete v1.7 feature set and IndexedDB schema v15.

## Deployed v1.7 audit

The deployed build was captured on 2026-09-16 across Today, Inbox, Planner, Projects, Habits, Reviews & history, and the Appearance drawer.

### Strengths retained

- Newsreader already gave Folio a credible editorial voice.
- Primary navigation and page structure were consistent.
- Empty-state copy was direct and useful.
- Thin lines and a single user-selected accent provided a sound foundation.
- Desktop interactions exposed clear semantic labels and keyboard-oriented actions.

### Highest-impact issues corrected

1. **Low reading contrast.** Secondary copy and metadata were too dim against almost identical blue-black surfaces.
2. **Dashboard repetition.** Outlined rectangles, metric cells, and card-like panels repeated across nearly every screen.
3. **Weak hierarchy.** Page title, section boundaries, top-bar context, and controls competed at similar visual weights.
4. **Excess dead space.** Small content clusters sat inside a very large dark canvas, particularly in blank and early-use states.
5. **Generic interaction language.** Four-pixel rounding, boxed search, glowing primary buttons, and a circular floating mobile action reproduced common dashboard conventions.
6. **Tiny metadata.** Several labels fell below a comfortable reading size and relied on low contrast at the same time.
7. **Overlay detachment.** Drawers felt like a separate generic admin system rather than part of Folio's editorial language.

Screenshot evidence was visual evidence only. Keyboard behavior, assistive-technology output, zoom resilience, and color contrast require executable verification in addition to screenshots.

## Selected system: Editorial desk

### Palette and surfaces

- Warm ink canvas rather than cool blue-black.
- Paper-like ivory text with materially brighter secondary copy.
- Structural rules establish hierarchy before filled containers.
- User accent remains configurable and independent from project colors.

### Typography

- Newsreader owns identity, page titles, workspace context, report values, and focus time.
- IBM Plex Sans remains the functional reading and control face.
- IBM Plex Mono is limited to compact dates, metadata, and system annotations.

### Geometry

- Controls and panels use crisp two-pixel geometry.
- Generic card stacks are replaced by open ruled sections where practical.
- Selected navigation uses a binding-edge marker instead of a filled rounded tile.
- The mobile Add affordance uses a rotated square rather than a floating circle.

### Density and hierarchy

- Desktop content width grows from 1180px to 1260px while page gutters stay responsive.
- Page titles and section dividers carry more hierarchy.
- Empty states use compact editorial callouts instead of large bordered cards.
- Reports and summaries use shared horizontal rules, not disconnected metric tiles.

### Interaction and motion

- Hover states use rule, text, and slight positional changes rather than glow.
- Active controls gain explicit line and accent states.
- Page entry uses a short six-pixel reveal.
- `prefers-reduced-motion` disables meaningful animation and transition duration.
- Keyboard focus uses a two-pixel accessible accent outline.

### Responsive behavior

- Mobile receives its own masthead, gutters, type scale, and bottom navigation treatment.
- Controls preserve 44px touch targets through the existing mobile hardening layer.
- Dialogs remain bottom sheets on small screens.
- Page actions wrap into a full-width functional row instead of disappearing.

## Compatibility boundary

- IndexedDB schema remains **v15**.
- No repository, service, domain, migration, or persistence behavior changed.
- All task, project, planner, habit, focus, review, import, patch, backup, and command workflows remain in place.
- The release changes styling, theme contrast derivation, metadata color, documentation, and release metadata only.
