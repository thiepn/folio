import { parseQuickCapture, parseQuickCaptureBatch } from './parser'

const projects = [
  { id: 'analysis', name: 'Analysis III' },
  { id: 'french', name: 'French' },
  { id: 'website', name: 'Website' },
  { id: 'work', name: 'Work' },
]
const today = '2026-08-20' as const

export const captureParserCases = [
  {
    input: 'Finish Analysis sheet tomorrow 90m !high #Analysis',
    expected: { title: 'Finish Analysis sheet', plannedDate: '2026-08-21', estimatedMinutes: 90, priority: 'high', projectId: 'analysis' },
  },
  {
    input: 'Read lecture notes fri due:sun 1h30m #Analysis',
    expected: { title: 'Read lecture notes', plannedDate: '2026-08-21', deadline: '2026-08-23', estimatedMinutes: 90, projectId: 'analysis' },
  },
  {
    input: '@inbox Buy groceries 20m',
    expected: { title: 'Buy groceries', status: 'inbox', plannedDate: undefined, estimatedMinutes: 20 },
  },
  {
    input: 'Prepare website release 2h !1 #Website 14:00',
    expected: { title: 'Prepare website release', estimatedMinutes: 120, priority: 'critical', projectId: 'website', startMinute: 840 },
  },
  {
    input: 'French review every mon,wed,fri 30m #French',
    expected: { title: 'French review', estimatedMinutes: 30, projectId: 'french', recurrenceFrequency: 'weekly' },
  },
  {
    input: 'Replace water filter after:30d 20m',
    expected: { title: 'Replace water filter', estimatedMinutes: 20, recurrenceFrequency: 'after-completion', completionUnit: 'day' },
  },
  {
    input: 'Refine plan 30m 90m !high !1 #French #Website',
    expected: { title: 'Refine plan', estimatedMinutes: 90, priority: 'critical', projectId: 'website' },
  },
  {
    input: 'Submit assignment next monday by next friday at 2:30pm for 1.5 hours p1 ~Analysis #exam #deep-work',
    expected: { title: 'Submit assignment', priority: 'critical', projectId: 'analysis', estimatedMinutes: 90, startMinute: 870, tagCount: 2 },
  },
  {
    input: 'Doctor appointment Sep 30 at noon',
    expected: { title: 'Doctor appointment', plannedDate: '2026-09-30', startMinute: 720 },
  },
  {
    input: 'Deep work in 3 days 2pm-3:30pm #focus',
    expected: { title: 'Deep work', plannedDate: '2026-08-23', startMinute: 840, estimatedMinutes: 90, tagCount: 1 },
  },
  {
    input: 'Standup every 2 weeks on mon,wed at 09:00 30m ~Work',
    expected: { title: 'Standup', recurrenceFrequency: 'weekly', recurrenceInterval: 2, recurrenceWeekdays: '1,3', projectId: 'work' },
  },
  {
    input: 'Pay bills every month on 1,15 20m',
    expected: { title: 'Pay bills', recurrenceFrequency: 'monthly', recurrenceMonthDays: '1,15' },
  },
  {
    input: 'Monthly close every month on last friday 2h',
    expected: { title: 'Monthly close', recurrenceFrequency: 'monthly', recurrenceMode: 'ordinal-weekday', recurrenceOrdinal: -1, recurrenceWeekday: 5 },
  },
  {
    input: 'Backup review every month on last day 30m',
    expected: { title: 'Backup review', recurrenceFrequency: 'monthly', recurrenceMode: 'last-day' },
  },
  {
    input: 'Birthday prep every year on sep 23 45m',
    expected: { title: 'Birthday prep', recurrenceFrequency: 'yearly', recurrenceYearMonths: '9', recurrenceMonthDays: '23' },
  },
  {
    input: 'Change filter 1 month after completion 20m',
    expected: { title: 'Change filter', recurrenceFrequency: 'after-completion', recurrenceInterval: 1, completionUnit: 'month' },
  },
  {
    input: 'Submit report tomorrow at 14:00 due next friday remind 30m before remind 1 day before deadline at 09:00 ~Work',
    expected: { title: 'Submit report', reminderCount: 2, firstReminderKind: 'time-block', secondReminderAnchor: 'deadline' },
  },
  {
    input: 'Call dentist tomorrow remind at 10:00',
    expected: { title: 'Call dentist', reminderCount: 1, firstReminderKind: 'task-date', firstReminderMinute: 600 },
  },
  {
    input: 'Prepare bags remind tomorrow at 18:00',
    expected: { title: 'Prepare bags', reminderCount: 1, firstReminderKind: 'absolute', firstReminderDate: '2026-08-21', firstReminderMinute: 1080 },
  },
  {
    input: '@inbox Think about thesis tomorrow remind at 18:00',
    expected: { title: 'Think about thesis', status: 'inbox', reminderCount: 0, warningCode: 'inbox-ignores-reminder' },
  },
  {
    input: 'Read paper #research ~Analysis',
    expected: { title: 'Read paper', projectId: 'analysis', tags: 'research' },
  },
  {
    input: 'Legacy project #Analysis #exam',
    expected: { title: 'Legacy project', projectId: 'analysis', tags: 'exam' },
  },
]

export function validateCaptureParserCases() {
  const failures: string[] = []
  for (const item of captureParserCases) {
    const actual = parseQuickCapture(item.input, projects, { today })
    for (const [key, value] of Object.entries(item.expected)) {
      if (key === 'recurrenceFrequency') {
        if (actual.recurrence?.frequency !== value) failures.push(`${item.input}: recurrenceFrequency expected ${String(value)} got ${String(actual.recurrence?.frequency)}`)
      } else if (key === 'recurrenceInterval') {
        if (actual.recurrence?.interval !== value) failures.push(`${item.input}: recurrenceInterval expected ${String(value)} got ${String(actual.recurrence?.interval)}`)
      } else if (key === 'recurrenceWeekdays') {
        if ((actual.recurrence?.weekdays ?? []).join(',') !== value) failures.push(`${item.input}: recurrenceWeekdays expected ${String(value)} got ${String(actual.recurrence?.weekdays)}`)
      } else if (key === 'recurrenceMode') {
        if (actual.recurrence?.monthlyMode !== value) failures.push(`${item.input}: recurrenceMode expected ${String(value)} got ${String(actual.recurrence?.monthlyMode)}`)
      } else if (key === 'recurrenceOrdinal') {
        if (actual.recurrence?.ordinal !== value) failures.push(`${item.input}: recurrenceOrdinal expected ${String(value)} got ${String(actual.recurrence?.ordinal)}`)
      } else if (key === 'recurrenceWeekday') {
        if (actual.recurrence?.weekday !== value) failures.push(`${item.input}: recurrenceWeekday expected ${String(value)} got ${String(actual.recurrence?.weekday)}`)
      } else if (key === 'recurrenceMonthDays') {
        if ((actual.recurrence?.monthDays ?? []).join(',') !== value) failures.push(`${item.input}: recurrenceMonthDays expected ${String(value)} got ${String(actual.recurrence?.monthDays)}`)
      } else if (key === 'recurrenceYearMonths') {
        if ((actual.recurrence?.yearMonths ?? []).join(',') !== value) failures.push(`${item.input}: recurrenceYearMonths expected ${String(value)} got ${String(actual.recurrence?.yearMonths)}`)
      } else if (key === 'completionUnit') {
        if (actual.recurrence?.afterCompletionUnit !== value) failures.push(`${item.input}: completionUnit expected ${String(value)} got ${String(actual.recurrence?.afterCompletionUnit)}`)
      } else if (key === 'tagCount') {
        if (actual.tags.length !== value) failures.push(`${item.input}: tagCount expected ${String(value)} got ${actual.tags.length}`)
      } else if (key === 'tags') {
        if (actual.tags.join(',') !== value) failures.push(`${item.input}: tags expected ${String(value)} got ${actual.tags.join(',')}`)
      } else if (key === 'reminderCount') {
        if (actual.reminders.length !== value) failures.push(`${item.input}: reminderCount expected ${String(value)} got ${actual.reminders.length}`)
      } else if (key === 'firstReminderKind') {
        if (actual.reminders[0]?.kind !== value) failures.push(`${item.input}: firstReminderKind expected ${String(value)} got ${String(actual.reminders[0]?.kind)}`)
      } else if (key === 'secondReminderAnchor') {
        if (actual.reminders[1]?.taskDateField !== value) failures.push(`${item.input}: secondReminderAnchor expected ${String(value)} got ${String(actual.reminders[1]?.taskDateField)}`)
      } else if (key === 'firstReminderMinute') {
        if (actual.reminders[0]?.minuteOfDay !== value) failures.push(`${item.input}: firstReminderMinute expected ${String(value)} got ${String(actual.reminders[0]?.minuteOfDay)}`)
      } else if (key === 'firstReminderDate') {
        if (actual.reminders[0]?.date !== value) failures.push(`${item.input}: firstReminderDate expected ${String(value)} got ${String(actual.reminders[0]?.date)}`)
      } else if (key === 'warningCode') {
        if (!actual.warnings.some((warning) => warning.code === value)) failures.push(`${item.input}: missing warning ${value}`)
      } else if ((actual as unknown as Record<string, unknown>)[key] !== value) {
        failures.push(`${item.input}: ${key} expected ${String(value)} got ${String((actual as unknown as Record<string, unknown>)[key])}`)
      }
    }
  }

  const batch = parseQuickCaptureBatch('Task one tomorrow\n\nTask two #research\nTask three @inbox', projects, { today })
  if (batch.length !== 3) failures.push(`batch: expected 3 tasks got ${batch.length}`)
  if (batch[0]?.title !== 'Task one' || batch[1]?.tags[0] !== 'research' || batch[2]?.status !== 'inbox') failures.push('batch: parsed lines did not retain independent semantics')

  return failures
}
