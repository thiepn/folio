# Folio Design System

## Intent

The interface should be more capable than it initially appears. Visual complexity stays low through hierarchy, contextual disclosure and strong type roles rather than floating card stacks.

## Typography roles

- **Newsreader**: page titles, major values, focus titles
- **IBM Plex Sans**: task labels, navigation, functional copy
- **IBM Plex Mono**: dates, durations, section labels, compact metadata

## Surface hierarchy

1. `--bg`: application canvas
2. `--bg-raised`: structural working regions
3. `--surface`: panels
4. `--surface-raised`: interactive or elevated state
5. warm ruled boundaries communicate hierarchy before shadows

## Geometry

- `1px`: micro controls / checkboxes
- `2px`: buttons, panels, and compact controls
- circular shapes are reserved for progress and status signals
- the mobile primary Add action uses a rotated square, not a floating circle

Large pill buttons, generic floating rounded cards, and repeated dashboard tiles are intentionally excluded. Open ruled sections are preferred where grouping does not require a contained surface.

## Accent semantics

The accent is not a theme background. It is used for:

- selected navigation
- primary actions
- progress state
- selected tabs
- focus indication
- current-day marker
- checkbox completion
- small high-information signals

It should not recolor all project or status information.

## Responsive model

Desktop is navigation + workspace. Mobile is Today/capture/planning-first and uses its own bottom navigation. Desktop layout is never simply scaled down.

## Accessibility foundation

- focus-visible outline uses accent
- semantic buttons remain actual buttons
- task checkboxes have textual ARIA labels
- accent-independent structure remains visible through borders/text
- arbitrary user accent colors derive an AA text color against the application canvas
