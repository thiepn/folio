import { dateKeyInTimeZone } from '../../domain/date'
import { parseIcs } from './icsLogic'

export function validateIcsCalendarV2Cases() {
  const failures:string[]=[]
  const text=[
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'X-WR-CALNAME:Imported',
    'BEGIN:VEVENT',
    'UID:all-day-1',
    'DTSTART;VALUE=DATE:20260923',
    'DTEND;VALUE=DATE:20260925',
    'SUMMARY:Conference',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:overnight-1',
    'DTSTART:20260923T230000Z',
    'DTEND:20260924T010000Z',
    'SUMMARY:Overnight deployment',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')

  const parsed=parseIcs(text)
  if(parsed.events.length!==2) failures.push('expected two imported events')
  if(parsed.calendarName!=='Imported') failures.push('calendar name not preserved')

  const allDay=parsed.events.find((event)=>event.uid==='all-day-1')
  if(!allDay?.allDay) failures.push('all-day flag missing')
  if(allDay?.startDate!=='2026-09-23'||allDay?.endDateExclusive!=='2026-09-25') failures.push('all-day date range incorrect')
  if(allDay && dateKeyInTimeZone(allDay.start,'local')!=='2026-09-23') failures.push('all-day start instant incorrect')

  const overnight=parsed.events.find((event)=>event.uid==='overnight-1')
  if(overnight?.allDay) failures.push('timed overnight event marked all-day')
  if(!overnight || Date.parse(overnight.end)-Date.parse(overnight.start)!==120*60_000) failures.push('overnight timed duration incorrect')
  if(parsed.warnings.length) failures.push('valid D7 ICS sample emitted warnings: '+parsed.warnings.join(' | '))

  return failures
}
