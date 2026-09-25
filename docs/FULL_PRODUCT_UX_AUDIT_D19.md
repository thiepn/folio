# D19 — Full-Product UX Audit

D19 is a correction phase over the completed D1–D18 product. It deliberately avoids adding another major feature system.

## Evidence boundary

The connected browser-testing integration was unavailable during this audit run. D19 therefore does **not** claim screenshot-grounded visual findings.

The audit used the production Folio source, responsive rules, navigation wiring, keyboard handlers, shared components, and release regression suite. Findings below are limited to behavior directly established from that implementation.

## Audit coverage

The audit reviewed the complete product at the workflow/system level:

1. Application shell and top-level navigation
2. Today and daily execution
3. Inbox capture/triage
4. Planner, Calendar, Kanban and Timeline
5. Projects, Lists, Tags and Notes
6. Habits and Focus
7. Search
8. Matrix, Analytics and Review
9. Templates and Automation
10. Sharing and External Integrations
11. Sync
12. Dialogs, drawers, keyboard navigation, responsive/mobile behavior and accessibility primitives

Existing focused phase validators remain the authoritative regression coverage for the detailed behavior inside each D1–D18 subsystem.

## Confirmed findings and fixes

### 1. Primary navigation had become a flat 15-destination list

**Finding:** D1–D18 progressively added destinations to one undifferentiated desktop list.

**Fix:** Desktop navigation now exposes four intent groups:

- Daily
- Workspace
- Review
- Tools

Nothing is hidden. The grouping changes information architecture only.

Short desktop windows now give the navigation region its own bounded scrolling rather than allowing the footer to fall outside the viewport.

### 2. Fresh workspaces displayed a useless empty Favorites block

**Finding:** When no favorites existed, the sidebar still consumed vertical space with explanatory placeholder copy.

**Fix:** The Favorites section does not render until at least one List, Project, Smart View or Tag is actually favorited/pinned.

### 3. Mobile More had become one long 12-item destination list

**Finding:** Advanced workspaces accumulated in a single mobile list with no visible hierarchy.

**Fix:** Mobile More now groups destinations into:

- Workspace
- Plan & review
- Connect

Today, Inbox, Planner and Add remain in the stable bottom navigation.

### 4. Phone layouts hid all PageHeader actions

**Finding:** The global max-width 560px rule used `.page-header__action { display: none }`.

That could hide important view controls simply because they lived in a PageHeader action slot.

**Fix:** Phone headers now stack. Header actions remain visible, wrap, and can expand to full-width controls.

### 5. Generic Tabs announced an ARIA tab pattern without tabpanels

**Finding:** The shared view-switching component emitted `tablist/tab/aria-selected`, but consumers do not create associated ARIA `tabpanel` relationships.

**Fix:** The control now uses a labeled button group with `aria-pressed`, while retaining Arrow/Home/End keyboard switching.

This matches the component's actual behavior instead of advertising an incomplete ARIA pattern.

### 6. Search keyboard state could become -1

**Finding:** Arrow Down used `results.length - 1` even when the result array was empty.

**Fix:** Arrow navigation now runs only when results exist and active selection is clamped whenever results change.

### 7. Search could leave stale errors visible

**Finding:** A failed query set an error, but starting a new successful query did not clear it immediately.

**Fix:** Starting a new search clears the prior error state.

### 8. Search result semantics were more complex than the actual interaction

**Finding:** Search used listbox/option roles while results themselves are clickable action buttons and focus stays in the search input.

**Fix:** Results retain native button semantics. Active keyboard position uses `aria-current`, result counts use a polite live region, and Arrow navigation scrolls the active result into view.

### 9. Inbox and global J/K handlers overlapped

**Finding:** Inbox defines J/K as triage selection while the global shortcut layer also defines J/K as next/previous task focus.

**Fix:** Global next/previous task shortcuts yield while Inbox is active.

### 10. Inbox fixed P/T shortcuts could steal browser shortcuts

**Finding:** Inbox checked only `event.key`. Modified keys such as Ctrl/Command+P could therefore invoke Inbox processing.

**Fix:** Inbox triage shortcuts ignore Ctrl, Command and Alt combinations and respect already-prevented events.

### 11. Topbar advertised a stale hard-coded command shortcut

**Finding:** Folio supports user-configurable palette shortcuts but the topbar always displayed `Ctrl/⌘ K`.

**Fix:** Topbar now renders the configured, platform-formatted palette shortcut. The reserved `/` alias remains visible separately.

### 12. Browser Back/Forward did not follow workspace navigation

**Finding:** Top-level Folio navigation existed only in React state/localStorage. Browser history had no representation of workspace changes.

**Fix:** The current top-level workspace is represented with a `view` query parameter.

- Initial restored workspace normalizes the current history entry.
- Navigation pushes the next workspace.
- Back/Forward restores the previous workspace.
- Navigation still resets transient task/habit selection, scrolls to the top, and moves focus to main content.

Deep project/list/task state remains local to each workspace and is intentionally not converted into a routing system in D19.

## Areas reviewed with no D19 change required

### Today

The fresh-workspace state already gives a concrete first task action and capacity action. Carryover, Top 3, habits, and Focus surfaces have explicit empty/next-action states.

### Inbox

The Inbox already has a structured zero state with Capture action and an explicit triage bar. D19 corrected only its keyboard collisions.

### Planner / Calendar / Kanban / Timeline

These systems already have dedicated responsive rules, tap-oriented mobile scheduling and bounded horizontal scrolling. D19 did not redesign them.

### Modal and drawer focus

Shared Modal and Drawer use:

- focus entry
- Tab trapping
- Escape handling
- nested-dialog topmost checks
- focus restoration
- document scroll locking

No replacement was justified from the code audit.

### Data integrity, Sync and external systems

D19 did not alter persistence, D18 conflict semantics, backup behavior, external integration confirmation boundaries, or automation logic. Those systems remain covered by their existing release validators.

## Accessibility limits

The source audit can verify DOM roles, labels, focus-management code, target sizes and responsive rules. It cannot verify:

- real screen-reader announcements across browser/AT combinations
- visual contrast after device/display transforms
- actual focus-ring visibility in every rendered screen
- zoom/reflow screenshots
- motion perceived in a real browser
- touch ergonomics on physical devices

Those belong to D20 browser/mobile/accessibility certification.

## Result

D19 reduces accumulated product friction without creating another subsystem.

The product remains schema v24 and all D1–D18 data/feature semantics are intentionally preserved.
