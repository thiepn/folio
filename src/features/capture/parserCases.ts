import { parseQuickCapture } from './parser'

const projects = [
  { id: 'analysis', name: 'Analysis III' },
  { id: 'french', name: 'French' },
  { id: 'website', name: 'Website' },
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
    expected: { title: 'Replace water filter', estimatedMinutes: 20, recurrenceFrequency: 'after-completion' },
  },
  {
    input: 'Refine plan 30m 90m !high !1 #French #Website',
    expected: { title: 'Refine plan', estimatedMinutes: 90, priority: 'critical', projectId: 'website' },
  },
]

export function validateCaptureParserCases() {
  const failures: string[] = []
  for (const item of captureParserCases) {
    const actual = parseQuickCapture(item.input, projects, { today })
    for (const [key, value] of Object.entries(item.expected)) {
      if (key === 'recurrenceFrequency') {
        if (actual.recurrence?.frequency !== value) failures.push(`${item.input}: recurrenceFrequency expected ${String(value)} got ${String(actual.recurrence?.frequency)}`)
      } else if (key === 'warningCode') {
        if (!actual.warnings.some((warning) => warning.code === value)) failures.push(`${item.input}: missing warning ${value}`)
      } else if ((actual as unknown as Record<string, unknown>)[key] !== value) {
        failures.push(`${item.input}: ${key} expected ${String(value)} got ${String((actual as unknown as Record<string, unknown>)[key])}`)
      }
    }
  }
  return failures
}
