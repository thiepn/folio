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
5. borders communicate hierarchy before shadows

## Geometry

- `3px`: micro controls / checkboxes
- `5px`: buttons / compact controls
- `7px`: panels
- circular shapes are reserved for progress and the mobile primary Add action

Large pill buttons and generic floating rounded cards are intentionally excluded.

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
- later accessibility phase will add contrast derivation/rejection for arbitrary user accent colors
