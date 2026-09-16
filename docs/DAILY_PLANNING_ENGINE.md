# Daily Planning Engine Contract

## Core rule

A Task describes work. A Daily Plan describes today's commitment to that work.

## Time ownership

| Entity | Owns |
| --- | --- |
| Task | planned day, hard deadline, estimate |
| DailyPlan | day status, one-day capacity override |
| DailyPlanItem | Must/Planned/Optional role and day order |
| TimeBlock | exact start/end time |

## Buckets

### Must
Work that should be protected first. High/Critical tasks default here until a day-specific role is materialized.

### Planned
Normal committed work. Normal-priority tasks default here.

### Optional
Work that should be removed first when the day does not fit.

Buckets are planning roles, not permanent task priorities.

## Carryover

Open tasks whose `plannedDate < today` are carryover. They are never moved automatically.

## Deadline horizon

Plan Day surfaces open tasks with deadlines from today through `today + 7 days`.

## Capacity

Default capacity is stored in settings. A Daily Plan can override it for one date.

Capacity-consuming habits contribute only their unfinished minutes.

## Commitment semantics

`draft` means the day is still being shaped.

`committed` means the user deliberately accepted the current day plan.

A planning mutation returns the plan to `draft`. Task completion does not.

## Recommendation contract

Recommendations are advisory only. The engine must never silently move, delete, cancel, or deprioritize tasks.
