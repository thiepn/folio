# Browser & Assistive-Technology Certification Matrix

Phase 20 source hardening is complete. The following matrix is the **manual built-app certification gate** for Phase 22/23; rows are not claimed as passed until exercised with a production build.

## Desktop browsers

| Target | Keyboard | IndexedDB | Offline reload | Dialog focus | 200% zoom | Forced colors / contrast | Status |
|---|---|---|---|---|---|---|---|
| Chrome current | required | required | required | required | required | required where OS supports | Pending built test |
| Edge current | required | required | required | required | required | required | Pending built test |
| Firefox current | required | required | required | required | required | required | Pending built test |
| Safari current | required | required | required | required | required | increased contrast | Pending built test |

## Mobile / installed PWA

| Target | Install/launch | Offline | Keyboard overlays | Safe areas | Focus recovery | Status |
|---|---|---|---|---|---|---|
| Android Chrome | required | required | required | required | required | Pending built test |
| iOS Safari / Home Screen | required | required | required | required | required | Pending built test |
| iPadOS Safari | required | required | hardware/software | required | required | Pending built test |

## Assistive technology

Minimum manual pass:

- NVDA + Firefox or Chrome on Windows;
- VoiceOver + Safari on macOS;
- VoiceOver + Safari/PWA on iOS;
- TalkBack + Chrome/PWA on Android.

Test tasks:

1. launch and skip to main content;
2. traverse primary navigation and confirm current-page announcement;
3. open/close nested drawer/modal and confirm focus restoration;
4. create and complete a Task;
5. use Tabs with Arrow/Home/End;
6. start/pause/finish Focus without timer announcements spamming every tick;
7. use Command Palette with keyboard only;
8. verify Undo announcement/action;
9. run Data & Storage reliability check;
10. verify reduced motion / forced colors / 200% text zoom.
