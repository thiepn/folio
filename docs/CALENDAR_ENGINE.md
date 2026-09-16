# Calendar Engine Contract — Phase 8

## Time concepts

The product now has three independent time layers:

1. `Task.plannedDate` — day-level intention.
2. `Task.deadline` — hard completion constraint.
3. `TimeBlock.start/end` — exact work/event reservation.

Do not collapse them into one field.

## TimeBlock kinds

### Task block

```text
kind = task
taskId = required
```

A task may own many task blocks.

### Event block

```text
kind = event
taskId = undefined
```

It reserves clock time but has no task lifecycle.

## Grid rules

- UI window: 06:00–22:00.
- granularity: 15 minutes.
- block minimum: 15 minutes.
- blocks created through the UI remain inside the visible window.
- overlaps are legal and flagged.

## Core calculations

### Task scheduling remainder

```text
remainingTaskMinutes = max(0, estimatedMinutes − Σ linked block duration)
```

### Open clock time

Open time uses the union of all occupied intervals, so overlapping blocks are not double-counted.

```text
open = visibleWindow − union(occupied intervals)
```

### Conflicts

Two blocks conflict when, on the same local date:

```text
B.start < A.end
AND
B.end > A.start
```

## Move semantics

Moving a Time Block:

- changes block start/end;
- preserves block duration;
- preserves linked Task fields;
- does not change Task estimate;
- does not change Task plannedDate;
- does not change Task deadline.

## Resize semantics

Resize:

- keeps start fixed;
- changes only end/duration;
- rounds to 15-minute increments;
- clamps to the end of the visible scheduling window.

## Delete semantics

Deleting a Time Block does not delete the linked Task.

Undo restores the exact prior TimeBlock entity.

## Quick Add

An exact start token is represented by `ParsedCapture.startMinute`.

If the capture is a To-do and has a planned day:

1. create Task;
2. create linked Time Block using estimate as initial duration;
3. expose one combined Undo.

Inbox captures ignore exact scheduling.
