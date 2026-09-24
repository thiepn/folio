# D12 — Statistics & Analytics

D12 adds a first-class Analytics workspace to Folio. It is intentionally derived from existing planner history rather than stored in a second analytics database.

## Shipped

- 30-day, 90-day, 12-month, year-to-date, and custom reporting ranges.
- Same-length previous-period comparisons.
- Task completion trends.
- Daily-plan execution: planned tasks versus same-day completions.
- Deadline volume and overdue rate.
- Focus totals, session counts, and manual-vs-timer evidence.
- Estimate-versus-actual calibration for completed tasks with tracked focus.
- Habit adherence, current streaks, best streaks, and completion counts.
- Project velocity from completed tasks and tracked focus.
- Planned workload versus daily capacity, including overloaded-day counts.
- Weekday planning/focus patterns.
- Time-of-day focus and completion patterns.
- Monthly reports.
- Yearly reports.
- Desktop, mobile, command-palette, and G+A navigation.
- Responsive charts and tables without introducing an external charting dependency.

## Data model

D12 does **not** introduce a schema v24 or analytics persistence table. The current schema remains v23.

Analytics are recomputed from:

- Tasks and completion/deadline timestamps
- Daily Plans and Daily Plan Items
- Focus Sessions
- Habit definitions and Habit Entries
- Projects
- Time Blocks
- Planner capacity settings

This prevents metrics from drifting away from Folio's source-of-truth records.

## Metric semantics

### Same-day plan execution

A Daily Plan item counts as executed for its planned day when its task was completed on or before that date. Completing it later remains visible as a task completion, but does not retroactively turn the missed plan into an on-time plan execution.

### Overdue rate

The denominator is tasks whose current deadline falls inside the selected period. A task is overdue when it was completed after that deadline or remains unresolved. Deleted completed tasks remain historical completion evidence; deleted unresolved tasks are excluded from current deadline accountability.

### Estimate calibration

Estimate-vs-actual uses completed root tasks that have both an estimate and tracked Focus time. Actual time includes timer and manual Focus records because both represent focused work.

### Workload

Planned workload uses estimated minutes from Daily Plan task items plus duration habits that count toward capacity. It is compared with the capacity saved for that date, falling back to the workspace default capacity.

## Limitations of historical reconstruction

Folio currently stores the task's current estimate and current deadline rather than every historical edit to those fields. D12 therefore uses the best evidence available from current task metadata plus immutable completion, Focus, Daily Plan, and Habit history. It does not invent historical estimate/deadline snapshots that were never recorded.
