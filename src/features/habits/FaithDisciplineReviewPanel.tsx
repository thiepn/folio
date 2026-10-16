import { useLiveQuery } from 'dexie-react-hooks'
import { addLocalDays, localDateKey, startOfLocalWeek } from '../../domain/date'
import { readFaithDisciplineWeek } from '../../services/faithDisciplineOwnerRead'

/** Derived from original Folio records. This component never writes progress. */
export function FaithDisciplineReviewPanel({ habitIds }: { habitIds: readonly string[] }) {
  const today = localDateKey()
  const from = startOfLocalWeek(today)
  const through = addLocalDays(from, 6)
  const selection = habitIds.join('|')
  const review = useLiveQuery(() =>
    readFaithDisciplineWeek(from, through, habitIds), [from, through, selection])
  return <section aria-label="Weekly faith practice review" style={{display:'grid',gap:'.65rem',marginBlock:'1rem'}}>
    <h3 style={{margin:0}}>This week's recorded practices</h3>
    <p>Only habits you placed in the Faith &amp; Discipline group and explicitly tagged focus sessions are included. Rest days are neutral.</p>
    {!review ? <p role="status">Reading original Folio records…</p> : <>
      <ul style={{display:'grid',gap:'.35rem',margin:0,paddingLeft:'1.25rem'}}>
        {review.practices.map(p => <li key={p.id}><strong>{p.title}</strong>: {p.completedDays} recorded day{p.completedDays===1?'':'s'}{p.restDays ? ` · ${p.restDays} rest day${p.restDays===1?'':'s'}` : ''}</li>)}
      </ul>
      <p>Tagged focus: {Math.round(review.focus.seconds / 60)} recorded minutes across {review.focus.sessions} completed session{review.focus.sessions===1?'':'s'}; {review.focus.interruptions} interruption{review.focus.interruptions===1?'':'s'}.</p>
      <small>Duration is original saved Folio focus time, not measured obedience or verified attention. Calendar events remain owned by the native Folio planner.</small>
    </>}
  </section>
}
