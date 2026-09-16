# v1.1 Refinement

Folio v1.1 is a product-quality refinement over the v1.0 stable source release. It keeps IndexedDB schema **v12**. The Folio rebrand adds a one-time database-name migration so existing local data moves safely into the `folio` database without changing the schema.

## What changed

- **Clean first run:** new installations start with an empty personal workspace rather than automatically inserting sample academic/personal data.
- **Optional sample workspace:** realistic sample projects, tasks, habits, and time blocks can still be loaded explicitly from **Data & storage** when the workspace is empty.
- **Global search:** the command palette now searches active tasks, projects, habits, and commands. Entity results are hidden until a query is typed so the default command list remains compact.
- **Workspace continuity:** the primary view is remembered locally and restored after reload.
- **Orientation:** desktop receives a contextual top bar with current section/status plus a visible search affordance; mobile shows the active section in its top bar.
- **Empty states:** Inbox, Projects, Habits, and a fresh Today workspace now provide clearer next actions.
- **Visual polish:** sidebar branding, local-first status, search chrome, and first-run presentation were refined without changing the restrained editorial design system.

## Compatibility

- Database schema: **v12** (unchanged)
- Backup restore range: **v8–v12** (unchanged)
- Existing databases are not cleared or reseeded.
- Existing users keep their data and appearance settings.

## Validation

The v1.1 source contract includes the v1.0 release checks plus explicit checks for clean first-run support, global workspace search, view persistence, and contextual top-bar wiring.
