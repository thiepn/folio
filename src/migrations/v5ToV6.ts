import type { Transaction } from 'dexie'
import { localDateKey } from '../domain/date'
import type { RecurringSeriesEntity, TaskEntity } from '../domain/models'

export async function migrateV5ToV6(transaction: Transaction) {
  const tasks = transaction.table<TaskEntity, string>('tasks')
  await tasks.toCollection().modify((task) => {
    if (task.seriesId && !task.recurrenceDate) task.recurrenceDate = task.plannedDate
  })

  const series = transaction.table<RecurringSeriesEntity, string>('recurringSeries')
  await series.toCollection().modify((item: any) => {
    item.status ??= 'active'
    item.startDate ??= item.materializedThrough ?? localDateKey()
    item.exceptions ??= {}
    if (item.rule?.frequency === undefined) item.rule = { frequency: 'daily', interval: 1 }
    item.rule.interval ??= 1
    item.taskTemplate ??= { title: item.title ?? 'Recurring task', description: '', priority: 'normal' }
    item.taskTemplate.description ??= ''
    item.taskTemplate.priority ??= 'normal'
  })
}
