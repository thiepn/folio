# D11 — Focus & Time Tracking V2

D11 turns Folio's Focus feature into a complete local-first execution and time-evidence layer while keeping focused work tied to the task/project system.

## Shipped

- Open stopwatch, single countdown, and configurable Pomodoro modes.
- Pomodoro work, short-break, long-break, and cycle-count configuration.
- Break time is tracked separately and never inflates focused-work totals.
- Explicit interruption logging distinct from ordinary pause/resume.
- Persistent minimized timer with exact countdown/phase boundary enforcement.
- Reload, focus, pageshow, and visibility reconciliation for active timed sessions.
- Session intention, context, tags, note, and interruption metadata.
- Built-in Focus presets plus user-created custom session presets.
- Daily and weekly focus goals used as guidance rather than gating.
- Manual time entries for focused work tracked outside Folio.
- Finished-session editing, reassignment, historical correction, and deletion with undo.
- Fourteen-day focus trend.
- Weekly project allocation and task actual-vs-estimate breakdown.
- Manual-vs-timer and interruption evidence.
- Richer Review/History integration.
- Schema v23 backup compatibility for advanced Focus session state.

## Timing invariant

`FocusSessionEntity.durationSeconds` means focused work only. Pomodoro break time is stored separately in `breakSeconds`. A running Pomodoro focus phase contributes to focus time; a running break phase contributes only to break time.

Countdown and Pomodoro phases are capped at their configured boundary. Background-tab or reload reconciliation pauses a phase at its exact target instead of crediting hidden-tab overshoot.

## Manual entries

Manual entries use the same `focusSessions` table with `source = "manual"`, finished status, explicit timestamps, and duration. They participate in task/project totals and reviews, while analytics can still separate them from timer-generated sessions.

## Editing and evidence

Only finished sessions can be historically edited or deleted. Edits can correct task association, start time, duration, context, tags, note, and interruption count. Timer-active state cannot be rewritten through the historical editor.

## Presets and goals

Focus presets and goals are stored in Folio settings. They therefore participate in ordinary full backups without another database table. Presets configure future sessions only and never mutate historical sessions.
