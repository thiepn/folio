# Mobile UX Hardening Contract

This document defines the Phase 17 behavior that later phases must preserve.

## Breakpoint roles

### Desktop — `>900px`
- Sidebar + desktop Topbar.
- Normal document scrolling.
- Right-side Drawers.
- Centered Modals.
- Week Calendar, drag/drop, and block resize available.

### Tablet portrait / compact tablet — `701–900px`
- Fixed mobile top/bottom navigation.
- Tablet-width content gutters.
- Centered Modals.
- Right-side Drawers.
- Multi-column Today/Projects/Review where useful.
- Calendar may retain side unscheduled column.

### Phone — `<=700px`
- Fixed safe-area topbar and bottom nav.
- More bottom sheet.
- Bottom-sheet Modals/Drawers.
- Calendar Day timeline only.
- Touch-first Schedule/Edit instead of precision dragging.
- Week Planner is horizontally snapping day cards.

### Small phone — `<=520px`
- Denser task metadata.
- two-column Review scorecards where possible;
- single-column forms;
- compact modal/footer behavior.

### Short landscape phone — height `<=520px`
- reduced navigation chrome;
- compact Focus execution;
- shorter Calendar timeline viewport.

## Navigation ownership

Phone primary navigation:

```text
Today | Inbox | Add | Planner | More
```

More must always expose:

```text
Projects
Habits
Review
Focus
Appearance
Data & Storage
```

No mature top-level feature may become unreachable merely because the desktop Sidebar is hidden.

## Scroll ownership

### Ordinary pages
Owner: document.

Do not globally set permanent `overflow: hidden` on `body`.

### Modal
Owner: `.modal__body`.

Header/footer remain stable.

### Drawer
Owner: `.drawer__body`.

### Calendar
Owner: `.calendar-timegrid__scroll` for vertical timeline.

### Horizontal rails
Only specifically marked rails may scroll horizontally.

The document itself must not horizontally scroll.

## Virtual keyboard rule

Use `100dvh` normally.

`visualViewport` is permitted only for active keyboard compensation. It must not become a universal viewport-height source.

When keyboard opens:
- hide bottom navigation;
- constrain active overlay to visible height;
- do not alter planner database state;
- do not resize every application screen using a global JS variable.

## Touch rule

Anything necessary to complete a primary workflow must have a touch-accessible alternative to hover/drag/right-click behavior.

Examples:
- Calendar drag → Schedule button / Event editor.
- Calendar resize → TimeBlock duration field.
- Week drag → weekday/Later menu.
- Task hover menu → visible touch menu trigger.

Target critical mobile controls around 44×44 CSS pixels.

## Safe-area ownership

Only the fixed chrome/sheets own device cutout padding.

- top safe area → mobile topbar / full-screen Focus
- bottom safe area → bottom nav / bottom-sheet footer
- left/right safe areas → page gutters and full-width sheets

Avoid adding safe-area padding independently to every nested panel.

## iOS form behavior

Do not disable pinch zoom.

All text-editing inputs/selects/textareas on phone must render at 16px or larger to prevent Safari focus zoom.

## Calendar mobile rule

Phone Calendar is Day mode. It must not compress seven columns to unreadable widths.

A user must be able to:
- browse day-by-day;
- see conflicts;
- see unscheduled work;
- schedule a task;
- add an Event;
- edit date/time/duration;
- remove a block;

without drag/drop.

## Installed PWA rule

The same layout rules apply in browser and standalone display mode.
Safe-area padding must remain correct with translucent iOS status/navigation bars.
