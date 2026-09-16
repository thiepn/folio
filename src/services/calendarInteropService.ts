import { db } from '../db/database'
import { localDateKey } from '../domain/date'
import type { CalendarImportBatchEntity, CalendarImportEventRef, LocalDate, TimeBlockEntity } from '../domain/models'
import { parseIcs, escapeIcsText, foldIcsLine, utcIcsDate, type ParsedIcsEvent } from '../features/interop/icsLogic'
import { timeBlockRepository } from '../repositories/timeBlockRepository'
import { taskRepository } from '../repositories/taskRepository'
import { projectRepository } from '../repositories/projectRepository'
import type { UndoableMutation } from './undo'

export interface CalendarImportPreviewEvent extends ParsedIcsEvent {
  duplicate: boolean
  duplicateReason?: string
  conflictTitles: string[]
}

export interface CalendarImportPreview {
  source: 'ics-file' | 'ics-paste'
  fileName?: string
  calendarName?: string
  warnings: string[]
  events: CalendarImportPreviewEvent[]
  importableCount: number
  duplicateCount: number
  conflictCount: number
}

export interface CalendarExportOptions {
  fromDate: LocalDate
  throughDate: LocalDate
  projectId?: string
  includeStandaloneEvents: boolean
  calendarName?: string
}

function sameImportedEvent(current: TimeBlockEntity, original: TimeBlockEntity) {
  return current.id === original.id && current.kind === original.kind && current.taskId === original.taskId && current.title === original.title && current.description === original.description && current.location === original.location && current.start === original.start && current.end === original.end && current.createdAt === original.createdAt && current.updatedAt === original.updatedAt
}

async function duplicateState() {
  const [batches, blocks] = await Promise.all([db.calendarImportBatches.where('status').equals('applied').toArray(), db.timeBlocks.toArray()])
  const fingerprints = new Set<string>()
  const sourceKeys = new Set<string>()
  for (const batch of batches) for (const event of batch.events) {
    fingerprints.add(event.fingerprint)
    if (event.sourceKey ?? event.uid) sourceKeys.add(event.sourceKey ?? event.uid!)
  }
  return { fingerprints, sourceKeys, blocks }
}

function findDuplicate(event: ParsedIcsEvent, state: Awaited<ReturnType<typeof duplicateState>>) {
  if (event.sourceKey && state.sourceKeys.has(event.sourceKey)) return 'Calendar UID/instance was already imported in an applied batch.'
  if (state.fingerprints.has(event.fingerprint)) return 'The same calendar event fingerprint was already imported.'
  const direct = state.blocks.find((block) => block.kind === 'event' && block.title.trim().toLowerCase() === event.summary.trim().toLowerCase() && block.start === event.start && block.end === event.end)
  if (direct) return 'An event with the same title and exact time already exists.'
  return undefined
}

export async function previewCalendarImport(text: string, source: CalendarImportPreview['source'], fileName?: string): Promise<CalendarImportPreview> {
  const parsed = parseIcs(text)
  const state = await duplicateState()
  const events = parsed.events.map((event) => {
    const duplicateReason = findDuplicate(event, state)
    const startMs = new Date(event.start).getTime(); const endMs = new Date(event.end).getTime()
    const conflictTitles = state.blocks.filter((block) => new Date(block.start).getTime() < endMs && new Date(block.end).getTime() > startMs && !(block.kind === 'event' && block.title.trim().toLowerCase() === event.summary.trim().toLowerCase() && block.start === event.start && block.end === event.end)).map((block) => block.title).slice(0, 4)
    return { ...event, duplicate: Boolean(duplicateReason), duplicateReason, conflictTitles }
  })
  for (let i = 0; i < events.length; i++) {
    if (events[i].duplicate) continue
    const startMs = Date.parse(events[i].start); const endMs = Date.parse(events[i].end)
    for (let j = 0; j < events.length; j++) {
      if (i === j || events[j].duplicate) continue
      if (Date.parse(events[j].start) < endMs && Date.parse(events[j].end) > startMs) {
        const label = `Import: ${events[j].summary}`
        if (!events[i].conflictTitles.includes(label) && events[i].conflictTitles.length < 4) events[i].conflictTitles.push(label)
      }
    }
  }
  return {
    source,
    fileName,
    calendarName: parsed.calendarName,
    warnings: parsed.warnings,
    events,
    importableCount: events.filter((event) => !event.duplicate).length,
    duplicateCount: events.filter((event) => event.duplicate).length,
    conflictCount: events.filter((event) => !event.duplicate && event.conflictTitles.length).length,
  }
}

export async function applyCalendarImport(preview: CalendarImportPreview): Promise<UndoableMutation> {
  const importable = preview.events.filter((event) => !event.duplicate)
  if (!importable.length) throw new Error('There are no new timed events to import.')
  const now = new Date().toISOString()
  const batchId = crypto.randomUUID()
  const created: CalendarImportEventRef[] = []

  await db.transaction('rw', db.timeBlocks, db.calendarImportBatches, async () => {
    // Duplicate protection is rechecked inside the transaction so a stale preview cannot double-import.
    const state = await duplicateState()
    for (const event of importable) {
      const duplicate = findDuplicate(event, state)
      if (duplicate) throw new Error(`Calendar changed after Preview: ${event.summary} — ${duplicate}`)
      const block: TimeBlockEntity = {
        id: crypto.randomUUID(),
        title: event.summary,
        description: event.description?.trim() || undefined,
        location: event.location?.trim() || undefined,
        kind: 'event',
        start: event.start,
        end: event.end,
        createdAt: now,
        updatedAt: now,
      }
      await db.timeBlocks.add(block)
      created.push({ uid: event.uid, sourceKey: event.sourceKey, fingerprint: event.fingerprint, timeBlockId: block.id, original: block })
      state.blocks.push(block)
      state.fingerprints.add(event.fingerprint)
      if (event.sourceKey) state.sourceKeys.add(event.sourceKey)
    }
    const batch: CalendarImportBatchEntity = {
      id: batchId,
      source: preview.source,
      fileName: preview.fileName,
      calendarName: preview.calendarName,
      status: 'applied',
      events: created,
      createdAt: now,
      updatedAt: now,
    }
    await db.calendarImportBatches.add(batch)
  })

  return {
    message: `Imported ${created.length} calendar event${created.length === 1 ? '' : 's'}`,
    undo: async () => { await revertCalendarImport(batchId) },
  }
}

export async function listCalendarImportBatches() {
  return db.calendarImportBatches.orderBy('createdAt').reverse().toArray()
}

export async function revertCalendarImport(batchId: string): Promise<void> {
  await db.transaction('rw', db.timeBlocks, db.calendarImportBatches, async () => {
    const batch = await db.calendarImportBatches.get(batchId)
    if (!batch) throw new Error('Calendar import batch not found.')
    if (batch.status !== 'applied') throw new Error('This calendar import is not currently applied.')
    for (const ref of batch.events) {
      const current = await db.timeBlocks.get(ref.timeBlockId)
      if (!current) throw new Error(`Revert blocked: imported event “${ref.original.title}” no longer exists.`)
      if (!sameImportedEvent(current, ref.original)) throw new Error(`Revert blocked: imported event “${ref.original.title}” was edited after import.`)
    }
    await db.timeBlocks.bulkDelete(batch.events.map((event) => event.timeBlockId))
    const now = new Date().toISOString()
    await db.calendarImportBatches.put({ ...batch, status: 'reverted', revertedAt: now, updatedAt: now })
  })
}

export async function exportCalendarIcs(options: CalendarExportOptions): Promise<string> {
  if (options.throughDate < options.fromDate) throw new Error('Calendar export end date must not be before start date.')
  const [blocks, tasks, projects] = await Promise.all([
    timeBlockRepository.listBetween(options.fromDate, options.throughDate),
    taskRepository.listAll(),
    projectRepository.listAll(),
  ])
  const taskMap = new Map(tasks.map((task) => [task.id, task]))
  const projectMap = new Map(projects.map((project) => [project.id, project]))
  const selected = blocks.filter((block) => {
    if (!block.taskId) return options.includeStandaloneEvents && !options.projectId
    if (!options.projectId) return true
    return taskMap.get(block.taskId)?.projectId === options.projectId
  })
  const stamp = utcIcsDate(new Date().toISOString())
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Folio//Personal Planner//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(options.calendarName ?? 'Folio')}`,
  ]
  for (const block of selected) {
    const task = block.taskId ? taskMap.get(block.taskId) : undefined
    const project = task?.projectId ? projectMap.get(task.projectId) : undefined
    const descriptionParts: string[] = []
    if (block.description) descriptionParts.push(block.description)
    if (task) {
      descriptionParts.push('Folio task time block')
      if (project) descriptionParts.push(`Project: ${project.name}`)
      if (task.deadline) descriptionParts.push(`Deadline: ${task.deadline}`)
      if (task.estimatedMinutes) descriptionParts.push(`Estimate: ${task.estimatedMinutes} minutes`)
    }
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:timeblock-${block.id}@folio.local`)
    lines.push(`DTSTAMP:${stamp}`)
    lines.push(`DTSTART:${utcIcsDate(block.start)}`)
    lines.push(`DTEND:${utcIcsDate(block.end)}`)
    lines.push(`SUMMARY:${escapeIcsText(block.title)}`)
    if (descriptionParts.length) lines.push(`DESCRIPTION:${escapeIcsText(descriptionParts.join('\n'))}`)
    if (block.location) lines.push(`LOCATION:${escapeIcsText(block.location)}`)
    lines.push(`X-FOLIO-KIND:${block.kind.toUpperCase()}`)
    lines.push(`X-FOLIO-TIMEBLOCK-ID:${block.id}`)
    if (task) lines.push(`X-FOLIO-TASK-ID:${task.id}`)
    if (project) lines.push(`X-FOLIO-PROJECT-ID:${project.id}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(foldIcsLine).join('\r\n') + '\r\n'
}

export function calendarImportDay(event: ParsedIcsEvent) {
  return localDateKey(new Date(event.start))
}
