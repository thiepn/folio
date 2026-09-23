# D4 — Capture Engine V2 & Natural-Language Quick Add

D4 turns Quick Add from a compact token parser into Folio's canonical local capture engine.

## Principle

Capture does not create a parallel AI/task format. It parses text into the existing D1–D3 canonical models:

- Task Engine V2 fields;
- D2 recurrence rules;
- D3 reminder definitions;
- Planner time blocks.

The parser is deterministic and local. No text is sent to a server.

## Natural dates

Supported date phrases include:

- today / tonight;
- tomorrow / day after tomorrow;
- weekday names;
- this Friday / next Friday;
- next week;
- this weekend / next weekend;
- in N days / weeks / months;
- ISO dates;
- Sep 30 / 30 Sep / explicit year variants.

Deadlines remain semantically separate from planned dates:

- `due Friday`;
- `by next Monday`;
- `deadline Sep 30`;
- legacy `due:fri`.

## Time and duration

Time phrases:

- `14:00`;
- `at 2pm`;
- `2:30 pm`;
- `noon` / `midnight`.

Time ranges infer both start and duration:

- `2pm-3:30pm` → start 14:00, estimate 90m.

Duration phrases:

- `45m`;
- `1h30m`;
- `for 90 minutes`;
- `for 1.5 hours`.

## Priority

Power and natural-ish forms remain explicit enough not to consume ordinary title words:

- `!high`, `!critical`, `!1`;
- `p1`, `p2`, `p3`;
- `priority high`, `priority critical`.

## Projects and tags

`~Project` and `project:"Project Name"` are the preferred project selectors.

Legacy `#Project` remains supported only when it uniquely resolves to an active project. Other `#tokens` become D1 task tags. Ambiguous project matches are warned rather than guessed.

Examples:

- `~Analysis #exam #deep-work`;
- `project:"Analysis III" #proofs`.

## Recurrence

D4 maps directly into the D2 rule model.

Examples:

- `every day`;
- `every 2 weeks on mon,wed`;
- `every weekdays`;
- `every month on 1,15`;
- `every month on last Friday`;
- `every month on last day`;
- `every year on Sep 23`;
- `30 days after completion`;
- `1 month after completion`;
- legacy `after:30d`;
- `until Dec 31`;
- `for 10 times` / `x10`.

## Reminders

D4 maps reminder phrases into the D3 reminder model.

Examples:

- `remind 30m before` → relative to calendar-block start;
- `remind 1 day before deadline at 09:00` → deadline-relative reminder;
- `remind at 18:00` → planned-day reminder;
- `remind tomorrow at 18:00` → one exact timestamp.

Invalid reminder anchors are surfaced as warnings and are not executed. For example, `remind 30m before` without a start time does not silently invent a clock time.

For recurring captures, relative planned/deadline/block reminders become series-owned reminder definitions and automatically follow future occurrences. An exact timestamp applies only to the first captured occurrence.

## Multi-task capture

Quick Add is now a multi-line capture surface.

- Paste one task per line.
- Shift+Enter creates a new line.
- Every line is parsed independently.
- A batch preview shows interpreted date/project/tags/repeat/reminder state.
- Batch creation uses one rollback-safe transaction pipeline.

If item N fails, previously created items in that batch are undone.

## Structured override

For a single task, the Details panel remains available after parsing. Users can override:

- title and notes;
- type;
- project;
- tags;
- planned date and deadline;
- estimate;
- priority;
- exact start.

Recurrence and reminders continue to come from the capture phrase so their semantics remain visible in the parse ledger.

## Compatibility

All previous compact syntax remains supported:

- `#Analysis` project when uniquely resolvable;
- `due:fri`;
- `14:00`;
- `45m`;
- `!1`;
- `after:30d`;
- `until:DATE`;
- `x10`;
- `@inbox`.

## Storage

D4 does not advance IndexedDB. Folio remains **schema v18** because capture is an input layer over existing entities.

## Deliberate boundaries

D4 does not use an LLM to guess user intent. It also does not silently interpret arbitrary prose as structured data. Ambiguity remains visible and editable.

Voice capture can later feed text into this same parser without changing task semantics; D4 does not require microphone permissions.

## Next

**D5 — Lists, Tags, Sections & Organization V2** can now build a global organization system on top of tags that D4 already captures consistently.
