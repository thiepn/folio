import type { Transaction } from 'dexie'

export async function migrateV16ToV17(tx: Transaction) {
  const seriesTable = tx.table('recurringSeries')
  const taskTable = tx.table('tasks')
  const seriesRows = await seriesTable.toArray()

  for (const series of seriesRows) {
    const firstOccurrence = await taskTable.where('seriesId').equals(series.id).first()
    const rule = series.rule ?? {}
    const template = series.taskTemplate ?? {}
    const monthDay = rule.monthDay

    await seriesTable.put({
      ...series,
      rule: {
        ...rule,
        monthlyMode: rule.monthlyMode ?? 'days',
        monthDays: Array.isArray(rule.monthDays)
          ? rule.monthDays
          : (monthDay ? [monthDay] : undefined),
        afterCompletionUnit: rule.afterCompletionUnit ?? 'day',
      },
      taskTemplate: {
        ...template,
        tags: Array.isArray(template.tags)
          ? template.tags
          : (Array.isArray(firstOccurrence?.tags) ? firstOccurrence.tags : []),
        checklist: Array.isArray(template.checklist)
          ? template.checklist
          : (Array.isArray(firstOccurrence?.checklist) ? firstOccurrence.checklist.map((item: any) => item.text).filter(Boolean) : []),
        sourceUrl: template.sourceUrl ?? firstOccurrence?.sourceUrl,
        location: template.location ?? firstOccurrence?.location,
        pinned: typeof template.pinned === 'boolean' ? template.pinned : Boolean(firstOccurrence?.pinned),
      },
    })
  }
}
