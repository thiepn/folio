# Power-User UX Contract — Phase 18

## Principle

Power-user interaction accelerates existing product semantics. It must never create a faster but behaviorally different second implementation of tasks, planning or deletion.

## Canonical shortcut map

| Shortcut | Action | Configurable |
|---|---|---:|
| Ctrl/Cmd+K | Command Palette | Yes |
| Q | Quick Add | Yes |
| F | Focus / Resume Focus | Yes |
| J | Next visible Task | Yes |
| K | Previous visible Task | Yes |
| X | Toggle focused Task selection | Yes |
| ? | Shortcut help | Yes |
| Enter | Open focused Task | No |
| C | Complete focused/selected Tasks | No |
| Ctrl/Cmd+A | Select visible Tasks | No |
| Ctrl/Cmd+Shift+A | Clear selection | No |
| Alt+Left | Move focused/selected one day earlier | No |
| Alt+Right | Move focused/selected one day later | No |
| G T | Today | No |
| G I | Inbox | No |
| G P | Planner | No |
| G O | Projects | No |
| G H | Habits | No |
| G R | Review | No |
| Esc | Dismiss / clear selection | No |

## Selection contract

A Task is selected only through explicit user input. Hover and keyboard focus are not selection.

Selection does not persist across:

- primary navigation;
- reload;
- backup;
- another device.

Range selection is based on current visible DOM ordering. This is intentional because the current view is the authority on user-visible ordering.

## Bulk mutation contract

### Complete

Uses the normal Task completion engine one Task at a time so completion-relative recurrence can produce its next occurrence correctly.

### Date movement

Uses Daily Planning service methods. Raw `plannedDate` bulk writes are forbidden for keyboard movement.

### Project / Priority

Uses TaskService bulk update. These commands do not create a separate bulk persistence layer.

### Trash

Uses soft deletion. It is reversible through the existing Undo architecture.

## Command Palette contract

The palette is a command index, not a hidden feature system. A palette command must correspond to an action that is either already visible elsewhere or is an acceleration of a valid existing domain operation.

Search operates on:

- command name;
- command group;
- explanatory note;
- keywords.

Selected-task commands are contextual and disappear when there is no selection.

## Accessibility contract

- Command Palette is a modal dialog.
- active result uses `aria-selected`.
- visible task focus remains a native button focus.
- keyboard-only operations do not require pointer hover state.
- Command Palette restores the element that owned focus before it opened.
- navigation transfers focus to main content after the view changes.
- all keyboard operations have pointer/touch equivalents.
- custom bindings cannot take reserved safety keys.

## Typing safety

Single-key global shortcuts are suspended when focus is inside:

- `<input>`;
- `<textarea>`;
- `<select>`;
- contenteditable.

Global shortcuts are also suspended while another dialog owns interaction. Escape remains available to dismiss the current surface.

## Mobile contract

Keyboard features do not change the Phase 17 phone mental model. Command Palette and bulk actions are supplemental touch-capable surfaces and never replace existing mobile buttons, menus or sheets.
