# Quick Add Capture Syntax

Phase 5 grammar is intentionally small. The goal is high recall and predictable behavior, not full natural-language understanding.

## Planned day

```text
today
tomorrow
mon
tuesday
fri
2026-08-28
```

Weekday names resolve to the next occurrence of that weekday. If today is the same weekday, the following week's occurrence is selected.

## Hard deadline

Deadlines use an explicit prefix so they cannot be confused with the planned day.

```text
due:fri
due:tomorrow
by:sun
by:2026-08-28
```

Example:

```text
Finish paper wed due:fri
```

means:

```text
Planned: Wednesday
Deadline: Friday
```

## Duration estimate

```text
10m
45m
1h
1h30m
2h
```

Bare numbers are never interpreted as durations.

## Priority

```text
!normal
!high
!critical

!3
!2
!1
```

Numeric aliases follow `1 = critical`, `2 = high`, `3 = normal`.

## Project

Single-token abbreviation:

```text
#Analysis
```

Exact multi-word name:

```text
#"Analysis III"
```

An abbreviation is only applied if it identifies exactly one active project.

## Task type

```text
@inbox
@todo
```

`inbox:` is also accepted as an Inbox marker.

Inbox captures intentionally have no planned day or project assignment.

## Precedence

If a field is supplied multiple times, the last valid token wins.

```text
30m 90m
```

→ `90m`

```text
!high !1
```

→ Critical

## Not parsed yet

### Exact clock time

```text
14:00
at:14:00
```

Detected, but not applied until Calendar & Timeblocking exists.

### Recurrence

```text
*
every Monday
```

Detected, but not applied until the Recurring Series engine exists.

The text remains in the task title, and Quick Add shows a warning. Nothing is silently lost.
