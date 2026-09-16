# Phase 17 Mobile Certification Matrix

The dependency-free source checks validate architecture and responsive contracts. The following matrix is the required **built-app / real-browser** certification before release.

## Required viewport matrix

| Profile | Suggested viewport | Primary purpose |
|---|---:|---|
| Small iPhone | 375×667 | minimum-width phone behavior |
| Modern iPhone | 390×844 | common iOS portrait |
| Large iPhone | 430×932 | safe-area + large phone |
| Small Android | 360×800 | narrow Android portrait |
| Modern Android | 412×915 | common Android portrait |
| Phone landscape | 667×375 | short-height hardening |
| Large phone landscape | 844×390 | landscape Focus/Calendar |
| Small tablet portrait | 744×1133 | tablet compact shell |
| Tablet portrait | 820×1180 | tablet two-column behavior |
| Tablet landscape | 1180×820 | desktop sidebar transition |

## Browser/device coverage

### iOS
- Safari browser mode
- installed Home Screen PWA
- portrait
- landscape
- software keyboard open/close
- safe-area/notch devices where available

### Android
- Chrome browser mode
- installed PWA
- portrait
- landscape
- gesture-navigation bottom inset
- software keyboard open/close

### Tablet
- iPadOS Safari/PWA
- Android tablet Chrome/PWA
- split-window width around the 900px breakpoint

## Workflow checklist

### Shell/navigation
- [ ] No page-level horizontal scrolling.
- [ ] Topbar remains fixed and readable.
- [ ] Bottom nav remains fixed and clears the gesture/home area.
- [ ] Today / Inbox / Add / Planner / More all work.
- [ ] More exposes Projects / Habits / Review / Focus / Appearance / Data.
- [ ] Rotate while More is open; hidden mobile overlay does not leave scrolling locked.

### Quick Add
- [ ] Opens above mobile nav.
- [ ] Initial field does not cause browser zoom.
- [ ] Keyboard hides bottom nav.
- [ ] Parse ledger remains reachable by scrolling modal body.
- [ ] Add & Continue keeps input visible above keyboard.
- [ ] Closing keyboard restores nav and sheet sizing.

### Task Inspector
- [ ] Bottom sheet opens without horizontal drift.
- [ ] Title/notes fields remain visible while keyboard is open.
- [ ] Footer/actions remain reachable.
- [ ] Subtasks and recurrence controls scroll within drawer body.
- [ ] Opening Recurrence over Task Inspector preserves background lock until both close.

### Today
- [ ] Task checkbox and menu are comfortable touch targets.
- [ ] Habit Complete / +minutes / Rest controls are touch-safe.
- [ ] Capacity layout does not clip.
- [ ] Plan Day is usable with long task lists.

### Planner — Week
- [ ] Day cards snap horizontally.
- [ ] Whole page does not move sideways.
- [ ] Move task via menu without dragging.
- [ ] Capacity edit input does not zoom iOS.
- [ ] Add task for day works.

### Planner — Calendar
- [ ] Phone opens/forces Day mode.
- [ ] Week toggle is absent on phone.
- [ ] Unscheduled tasks scroll horizontally within their rail.
- [ ] Tap Schedule opens TimeBlock editor.
- [ ] Tap block edits timing/duration.
- [ ] No precision resize gesture is required.
- [ ] + Event works.
- [ ] Timeline scrolls vertically without moving the document horizontally.
- [ ] Conflicts remain visible.

### Projects/Habits/Review
- [ ] Reachable from More.
- [ ] Project action controls wrap without clipping.
- [ ] Habit editor/details scroll correctly.
- [ ] Review statistics and weekly workflow remain readable at 360px.

### Focus
- [ ] Launcher fits portrait.
- [ ] Running timer fits portrait.
- [ ] Pause / Finish / Finish+Complete are reachable.
- [ ] Short landscape layout remains usable.
- [ ] Leaving Focus keeps session active.
- [ ] Resume Focus remains reachable from topbar/More.

### Overlay/scroll ownership
- [ ] Page behind modal does not scroll.
- [ ] Modal body scrolls independently.
- [ ] Drawer body scrolls independently.
- [ ] Closing nested overlay does not unlock underlying overlay.
- [ ] Closing final overlay restores original page scroll position.

### Software keyboard
- [ ] Bottom nav hides only while keyboard is genuinely open.
- [ ] Orientation/keyboard transitions do not leave nav permanently hidden.
- [ ] Modal height follows visible keyboard viewport.
- [ ] No global page-height jump after keyboard closes.

### PWA/system UI
- [ ] Offline banner clears topbar.
- [ ] Backup reminder clears bottom nav.
- [ ] Update banner stays below active modal/focus overlay.
- [ ] Standalone PWA respects top/bottom safe areas.
- [ ] Offline relaunch preserves the same responsive layout.

## Regression gates

Release fails Phase 17 certification if any of the following is reproducible:

1. document-level horizontal scrolling at any required viewport;
2. unreachable mature feature on phone;
3. bottom nav covering focused form fields;
4. Safari input focus zoom caused by planner controls;
5. modal background scrolling while modal is active;
6. hidden More overlay retaining document scroll lock after resize;
7. Calendar requiring drag or resize gestures on phone;
8. seven-column Calendar compressed into phone width;
9. controls under safe-area/home indicator;
10. Focus execution buttons inaccessible in supported portrait/landscape sizes.
