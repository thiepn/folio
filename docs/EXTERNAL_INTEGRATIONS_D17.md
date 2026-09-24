# D17 — External Integrations

D17 adds practical bridges between Folio and external apps while preserving Folio's local-first architecture.

## Scope

D17 implements integrations that can work honestly in a static PWA:

- Google Calendar outbound event handoff
- Outlook Calendar outbound event handoff
- Single-event ICS export
- Existing full ICS import/export entry point
- Email → task capture
- PWA Share Target
- Browser bookmarklet capture
- Versioned URL integration protocol
- Optional `web+folio:` protocol registration
- Task capture endpoint URLs
- Template endpoint URLs
- Automation endpoint URLs
- Local integration activity history

D17 does not claim OAuth calendar sync, inbox polling, cloud webhooks, or a hosted API server.

## Confirmation boundary

Incoming external requests never mutate Folio immediately.

Share Target, URL, and `web+folio:` requests are converted into a staged Integration Intent. Folio opens the Integrations workspace and shows the request with Confirm / Dismiss controls.

Only Confirm can execute:

- Capture a task
- Instantiate a template
- Run a manual automation

This prevents a malicious URL from silently changing the local database.

## URL protocol

The browser URL protocol uses `folioAction` query parameters.

### Capture

`?folioAction=capture&title=Read&text=Context&url=https://example.com&plannedDate=2026-09-25`

Optional fields:

- title
- text
- http/https source URL
- projectId
- plannedDate

A capture with neither project nor planned date becomes Inbox work. A project-targeted or planned capture becomes a normal To-do.

### Template

`?folioAction=template&templateId=<id>&anchorDate=2026-09-25`

The target template is resolved at confirmation time. Task templates create a task tree; project templates create a project.

### Automation

`?folioAction=automation&ruleId=<id>&taskId=<id>`

This uses D15's manual automation path and therefore inherits rule conditions, logging, and Undo.

## PWA Share Target

The web app manifest now registers Folio as a Share Target for:

- title
- text
- URL

The Share Target uses GET so Folio can remain a static GitHub Pages PWA without pretending it has a POST server. Shared content is staged for confirmation.

## Custom protocol

The manifest also advertises a `web+folio` protocol handler.

Folio exposes a user-gesture registration button using `navigator.registerProtocolHandler` where the browser supports it.

Examples:

- `web+folio:capture?title=Read%20this&url=https%3A%2F%2Fexample.com`
- `web+folio:template?templateId=<id>`
- `web+folio:automation?ruleId=<id>&taskId=<id>`

Browser support and user approval still control whether registration succeeds.

## Bookmarklet

D17 can generate a bookmarklet that captures:

- Current page title
- Current page URL
- Selected page text

The bookmarklet opens the same confirmation protocol; it does not directly write to IndexedDB.

## Email → task

The local email parser accepts raw or forwarded email text.

It recognizes common headers:

- Subject
- From
- Date

The body becomes task notes and the first http/https link becomes the task source URL.

Creation is explicit and produces an Inbox task through Folio's normal Task service, so task-created automations and Undo still apply.

## Calendar bridges

### Google Calendar

A selected Folio Time Block can open Google Calendar's event composer with:

- Title
- Start/end
- All-day semantics
- Description
- Location

### Outlook Calendar

The same Time Block can open Outlook Calendar's web compose surface.

### ICS

A selected Time Block can also be downloaded as a standalone VEVENT. All-day events use date-valued DTSTART/DTEND rather than guessed midnight instants.

Full-range ICS import/export remains available through Folio's existing Portability & Calendar surface.

## Webhooks and API boundary

A GitHub Pages app cannot receive authenticated arbitrary POST webhooks when the app is closed.

D17 therefore does not expose a fake webhook endpoint.

The supported automation/API bridge is a confirmation URL that external tools can open. This works with tools such as mobile shortcuts, automation launchers, bookmarklets, and other systems capable of opening a URL.

A future server-backed integration gateway would be a separate architecture phase.

## History

D17 stores a local bounded audit trail under:

`integrations.history.v1`

It records confirmed email/capture/template/automation actions and outbound Google/Outlook/ICS handoffs.

The history uses the existing Settings table and is therefore included in normal full backups.

## Architecture

D17 remains on **database schema v23**.

No OAuth tokens, external credentials, server, remote database, or schema v24 are introduced.
