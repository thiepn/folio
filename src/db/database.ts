import Dexie, { type Table } from 'dexie'
import type {
  DailyPlanEntity,
  DailyPlanItemEntity,
  FocusSessionEntity,
  HabitEntity,
  HabitEntryEntity,
  ImportBatchEntity,
  PatchBatchEntity,
  CalendarImportBatchEntity,
  ProjectEntity,
  RecurringSeriesEntity,
  ReviewRecordEntity,
  SettingEntity,
  TaskEntity,
  TimeBlockEntity,
} from '../domain/models'
import { migrateV1ToV2 } from '../migrations/v1ToV2'
import { migrateV2ToV3 } from '../migrations/v2ToV3'
import { migrateV3ToV4 } from '../migrations/v3ToV4'
import { migrateV4ToV5 } from '../migrations/v4ToV5'
import { migrateV5ToV6 } from '../migrations/v5ToV6'
import { migrateV6ToV7 } from '../migrations/v6ToV7'
import { migrateV7ToV8 } from '../migrations/v7ToV8'
import { migrateV8ToV9 } from '../migrations/v8ToV9'
import { migrateV9ToV10 } from '../migrations/v9ToV10'
import { migrateV10ToV11 } from '../migrations/v10ToV11'
import { migrateV11ToV12 } from '../migrations/v11ToV12'
import { migrateV12ToV13 } from '../migrations/v12ToV13'
import { migrateV13ToV14 } from '../migrations/v13ToV14'
import { migrateV14ToV15 } from '../migrations/v14ToV15'
import { migrateV15ToV16 } from '../migrations/v15ToV16'
import { migrateV16ToV17 } from '../migrations/v16ToV17'

export const DATABASE_NAME = 'folio'
export const DATABASE_SCHEMA_VERSION = 17

export class ProductivityDatabase extends Dexie {
  tasks!: Table<TaskEntity, string>
  projects!: Table<ProjectEntity, string>
  habits!: Table<HabitEntity, string>
  habitEntries!: Table<HabitEntryEntity, string>
  timeBlocks!: Table<TimeBlockEntity, string>
  dailyPlans!: Table<DailyPlanEntity, string>
  dailyPlanItems!: Table<DailyPlanItemEntity, string>
  focusSessions!: Table<FocusSessionEntity, string>
  recurringSeries!: Table<RecurringSeriesEntity, string>
  settings!: Table<SettingEntity, string>
  importBatches!: Table<ImportBatchEntity, string>
  patchBatches!: Table<PatchBatchEntity, string>
  calendarImportBatches!: Table<CalendarImportBatchEntity, string>
  reviewRecords!: Table<ReviewRecordEntity, string>

  constructor(databaseName = DATABASE_NAME) {
    super(databaseName)

    this.version(1).stores({
      tasks: '&id,completed,projectId,plannedDate',
      projects: '&id,name',
      settings: '&key',
    })

    this.version(2).stores({
      tasks: '&id,status,plannedDate,deadline,projectId,seriesId,updatedAt,[status+plannedDate]',
      projects: '&id,name,type,updatedAt',
      habits: '&id,updatedAt',
      habitEntries: '&id,habitId,date,updatedAt,[habitId+date]',
      timeBlocks: '&id,taskId,start,end,kind,updatedAt',
      focusSessions: '&id,taskId,startedAt,endedAt,status',
      recurringSeries: '&id,timezone,updatedAt',
      settings: '&key,updatedAt',
      importBatches: '&id,createdAt,status,source',
    }).upgrade(migrateV1ToV2)

    this.version(3).stores({
      tasks: '&id,status,plannedDate,deadline,projectId,parentTaskId,seriesId,deletedAt,updatedAt,[status+plannedDate]',
      projects: '&id,name,type,updatedAt',
      habits: '&id,updatedAt',
      habitEntries: '&id,habitId,date,updatedAt,[habitId+date]',
      timeBlocks: '&id,taskId,start,end,kind,updatedAt',
      focusSessions: '&id,taskId,startedAt,endedAt,status',
      recurringSeries: '&id,timezone,updatedAt',
      settings: '&key,updatedAt',
      importBatches: '&id,createdAt,status,source',
    }).upgrade(migrateV2ToV3)


    this.version(4).stores({
      tasks: '&id,status,plannedDate,deadline,projectId,parentTaskId,seriesId,deletedAt,updatedAt,[status+plannedDate]',
      projects: '&id,name,type,archived,favorite,updatedAt,[archived+favorite]',
      habits: '&id,updatedAt',
      habitEntries: '&id,habitId,date,updatedAt,[habitId+date]',
      timeBlocks: '&id,taskId,start,end,kind,updatedAt',
      focusSessions: '&id,taskId,startedAt,endedAt,status',
      recurringSeries: '&id,timezone,updatedAt',
      settings: '&key,updatedAt',
      importBatches: '&id,createdAt,status,source',
    }).upgrade(migrateV3ToV4)

    this.version(5).stores({
      tasks: '&id,status,plannedDate,deadline,projectId,parentTaskId,seriesId,deletedAt,updatedAt,[status+plannedDate]',
      projects: '&id,name,type,archived,favorite,updatedAt,[archived+favorite]',
      habits: '&id,updatedAt',
      habitEntries: '&id,habitId,date,updatedAt,[habitId+date]',
      timeBlocks: '&id,taskId,start,end,kind,updatedAt',
      dailyPlans: '&date,status,updatedAt',
      dailyPlanItems: '&id,date,taskId,bucket,updatedAt,[date+bucket],[date+taskId]',
      focusSessions: '&id,taskId,startedAt,endedAt,status',
      recurringSeries: '&id,timezone,updatedAt',
      settings: '&key,updatedAt',
      importBatches: '&id,createdAt,status,source',
    }).upgrade(migrateV4ToV5)


    this.version(6).stores({
      tasks: '&id,status,plannedDate,deadline,projectId,parentTaskId,seriesId,recurrenceDate,deletedAt,updatedAt,[status+plannedDate],[seriesId+recurrenceDate]',
      projects: '&id,name,type,archived,favorite,updatedAt,[archived+favorite]',
      habits: '&id,updatedAt',
      habitEntries: '&id,habitId,date,updatedAt,[habitId+date]',
      timeBlocks: '&id,taskId,start,end,kind,updatedAt',
      dailyPlans: '&date,status,updatedAt',
      dailyPlanItems: '&id,date,taskId,bucket,updatedAt,[date+bucket],[date+taskId]',
      focusSessions: '&id,taskId,startedAt,endedAt,status',
      recurringSeries: '&id,status,startDate,timezone,updatedAt,[status+startDate]',
      settings: '&key,updatedAt',
      importBatches: '&id,createdAt,status,source',
    }).upgrade(migrateV5ToV6)

    this.version(7).stores({
      tasks: '&id,status,plannedDate,deadline,projectId,parentTaskId,seriesId,recurrenceDate,deletedAt,updatedAt,[status+plannedDate],[seriesId+recurrenceDate]',
      projects: '&id,name,type,archived,favorite,updatedAt,[archived+favorite]',
      habits: '&id,updatedAt',
      habitEntries: '&id,habitId,date,updatedAt,[habitId+date]',
      timeBlocks: '&id,taskId,start,end,kind,updatedAt',
      dailyPlans: '&date,status,updatedAt',
      dailyPlanItems: '&id,date,taskId,bucket,updatedAt,[date+bucket],[date+taskId]',
      focusSessions: '&id,taskId,projectIdSnapshot,startedAt,endedAt,status,[status+startedAt]',
      recurringSeries: '&id,status,startDate,timezone,updatedAt,[status+startDate]',
      settings: '&key,updatedAt',
      importBatches: '&id,createdAt,status,source',
    }).upgrade(migrateV6ToV7)

    this.version(8).stores({
      tasks: '&id,status,plannedDate,deadline,projectId,parentTaskId,seriesId,recurrenceDate,deletedAt,updatedAt,[status+plannedDate],[seriesId+recurrenceDate]',
      projects: '&id,name,type,archived,favorite,updatedAt,[archived+favorite]',
      habits: '&id,sortOrder,updatedAt',
      habitEntries: '&id,habitId,date,status,updatedAt,[habitId+date],[habitId+status]',
      timeBlocks: '&id,taskId,start,end,kind,updatedAt',
      dailyPlans: '&date,status,updatedAt',
      dailyPlanItems: '&id,date,taskId,bucket,updatedAt,[date+bucket],[date+taskId]',
      focusSessions: '&id,taskId,projectIdSnapshot,startedAt,endedAt,status,[status+startedAt]',
      recurringSeries: '&id,status,startDate,timezone,updatedAt,[status+startDate]',
      settings: '&key,updatedAt',
      importBatches: '&id,createdAt,status,source',
    }).upgrade(migrateV7ToV8)

    this.version(9).stores({
      tasks: '&id,status,plannedDate,deadline,projectId,parentTaskId,seriesId,recurrenceDate,deletedAt,updatedAt,[status+plannedDate],[seriesId+recurrenceDate]',
      projects: '&id,name,type,archived,favorite,updatedAt,[archived+favorite]',
      habits: '&id,sortOrder,updatedAt',
      habitEntries: '&id,habitId,date,status,updatedAt,[habitId+date],[habitId+status]',
      timeBlocks: '&id,taskId,start,end,kind,updatedAt',
      dailyPlans: '&date,status,updatedAt',
      dailyPlanItems: '&id,date,taskId,bucket,updatedAt,[date+bucket],[date+taskId]',
      focusSessions: '&id,taskId,projectIdSnapshot,startedAt,endedAt,status,[status+startedAt]',
      recurringSeries: '&id,status,startDate,timezone,updatedAt,[status+startDate]',
      settings: '&key,updatedAt',
      importBatches: '&id,createdAt,status,source',
    }).upgrade(migrateV8ToV9)

    this.version(10).stores({
      tasks: '&id,status,plannedDate,deadline,projectId,parentTaskId,seriesId,recurrenceDate,deletedAt,updatedAt,[status+plannedDate],[seriesId+recurrenceDate]',
      projects: '&id,name,type,archived,favorite,updatedAt,[archived+favorite]',
      habits: '&id,sortOrder,updatedAt',
      habitEntries: '&id,habitId,date,status,updatedAt,[habitId+date],[habitId+status]',
      timeBlocks: '&id,taskId,start,end,kind,updatedAt',
      dailyPlans: '&date,status,updatedAt',
      dailyPlanItems: '&id,date,taskId,bucket,updatedAt,[date+bucket],[date+taskId]',
      focusSessions: '&id,taskId,projectIdSnapshot,startedAt,endedAt,status,[status+startedAt]',
      recurringSeries: '&id,status,startDate,timezone,updatedAt,[status+startDate]',
      settings: '&key,updatedAt',
      importBatches: '&id,createdAt,status,source',
      patchBatches: '&id,createdAt,status,source',
    }).upgrade(migrateV9ToV10)

    this.version(11).stores({
      tasks: '&id,status,plannedDate,deadline,projectId,parentTaskId,seriesId,recurrenceDate,deletedAt,updatedAt,[status+plannedDate],[seriesId+recurrenceDate]',
      projects: '&id,name,type,archived,favorite,updatedAt,[archived+favorite]',
      habits: '&id,sortOrder,updatedAt',
      habitEntries: '&id,habitId,date,status,updatedAt,[habitId+date],[habitId+status]',
      timeBlocks: '&id,taskId,start,end,kind,updatedAt',
      dailyPlans: '&date,status,updatedAt',
      dailyPlanItems: '&id,date,taskId,bucket,updatedAt,[date+bucket],[date+taskId]',
      focusSessions: '&id,taskId,projectIdSnapshot,startedAt,endedAt,status,[status+startedAt]',
      recurringSeries: '&id,status,startDate,timezone,updatedAt,[status+startDate]',
      settings: '&key,updatedAt',
      importBatches: '&id,createdAt,status,source',
      patchBatches: '&id,createdAt,status,source',
      calendarImportBatches: '&id,createdAt,status,source',
    }).upgrade(migrateV10ToV11)


    this.version(12).stores({
      tasks: '&id,status,plannedDate,deadline,projectId,parentTaskId,seriesId,recurrenceDate,*blockedByTaskIds,deletedAt,updatedAt,[status+plannedDate],[seriesId+recurrenceDate]',
      projects: '&id,name,type,archived,favorite,updatedAt,[archived+favorite]',
      habits: '&id,sortOrder,updatedAt',
      habitEntries: '&id,habitId,date,status,updatedAt,[habitId+date],[habitId+status]',
      timeBlocks: '&id,taskId,start,end,kind,updatedAt',
      dailyPlans: '&date,status,updatedAt',
      dailyPlanItems: '&id,date,taskId,bucket,updatedAt,[date+bucket],[date+taskId]',
      focusSessions: '&id,taskId,projectIdSnapshot,startedAt,endedAt,status,[status+startedAt]',
      recurringSeries: '&id,status,startDate,timezone,updatedAt,[status+startDate]',
      settings: '&key,updatedAt',
      importBatches: '&id,createdAt,status,source',
      patchBatches: '&id,createdAt,status,source',
      calendarImportBatches: '&id,createdAt,status,source',
    }).upgrade(migrateV11ToV12)

    this.version(13).stores({
      tasks: '&id,status,plannedDate,deadline,projectId,parentTaskId,seriesId,recurrenceDate,*blockedByTaskIds,deletedAt,updatedAt,[status+plannedDate],[seriesId+recurrenceDate]',
      projects: '&id,name,type,status,deadline,archived,favorite,updatedAt,[archived+favorite]',
      habits: '&id,sortOrder,updatedAt',
      habitEntries: '&id,habitId,date,status,updatedAt,[habitId+date],[habitId+status]',
      timeBlocks: '&id,taskId,start,end,kind,updatedAt',
      dailyPlans: '&date,status,updatedAt',
      dailyPlanItems: '&id,date,taskId,bucket,updatedAt,[date+bucket],[date+taskId]',
      focusSessions: '&id,taskId,projectIdSnapshot,startedAt,endedAt,status,[status+startedAt]',
      recurringSeries: '&id,status,startDate,timezone,updatedAt,[status+startDate]',
      settings: '&key,updatedAt',
      importBatches: '&id,createdAt,status,source',
      patchBatches: '&id,createdAt,status,source',
      calendarImportBatches: '&id,createdAt,status,source',
    }).upgrade(migrateV12ToV13)

    this.version(14).stores({
      tasks: '&id,status,plannedDate,deadline,projectId,parentTaskId,seriesId,recurrenceDate,*blockedByTaskIds,deletedAt,updatedAt,[status+plannedDate],[seriesId+recurrenceDate]',
      projects: '&id,name,type,status,deadline,archived,favorite,updatedAt,[archived+favorite]',
      habits: '&id,sortOrder,updatedAt',
      habitEntries: '&id,habitId,date,status,updatedAt,[habitId+date],[habitId+status]',
      timeBlocks: '&id,taskId,start,end,kind,updatedAt',
      dailyPlans: '&date,status,updatedAt',
      dailyPlanItems: '&id,date,taskId,bucket,updatedAt,[date+bucket],[date+taskId]',
      focusSessions: '&id,taskId,projectIdSnapshot,startedAt,endedAt,status,[status+startedAt]',
      recurringSeries: '&id,status,startDate,timezone,updatedAt,[status+startDate]',
      settings: '&key,updatedAt',
      importBatches: '&id,createdAt,status,source',
      patchBatches: '&id,createdAt,status,source',
      calendarImportBatches: '&id,createdAt,status,source',
      reviewRecords: '&id,kind,periodStart,periodEnd,updatedAt,[kind+periodStart]',
    }).upgrade(migrateV13ToV14)

    this.version(15).stores({
      tasks: '&id,status,plannedDate,deadline,projectId,parentTaskId,seriesId,recurrenceDate,*blockedByTaskIds,deletedAt,updatedAt,[status+plannedDate],[seriesId+recurrenceDate]',
      projects: '&id,name,type,status,deadline,archived,favorite,updatedAt,[archived+favorite]',
      habits: '&id,sortOrder,updatedAt',
      habitEntries: '&id,habitId,date,status,updatedAt,[habitId+date],[habitId+status]',
      timeBlocks: '&id,taskId,start,end,kind,updatedAt',
      dailyPlans: '&date,status,updatedAt',
      dailyPlanItems: '&id,date,taskId,bucket,updatedAt,[date+bucket],[date+taskId]',
      focusSessions: '&id,taskId,projectIdSnapshot,startedAt,endedAt,status,[status+startedAt]',
      recurringSeries: '&id,status,startDate,timezone,updatedAt,[status+startDate]',
      settings: '&key,updatedAt',
      importBatches: '&id,createdAt,status,source',
      patchBatches: '&id,createdAt,status,source',
      calendarImportBatches: '&id,createdAt,status,source',
      reviewRecords: '&id,kind,periodStart,periodEnd,updatedAt,[kind+periodStart]',
    }).upgrade(migrateV14ToV15)

    this.version(16).stores({
      tasks: '&id,status,plannedDate,deadline,projectId,parentTaskId,seriesId,recurrenceDate,*blockedByTaskIds,*tags,pinned,deletedAt,updatedAt,[status+plannedDate],[seriesId+recurrenceDate]',
      projects: '&id,name,type,status,deadline,archived,favorite,updatedAt,[archived+favorite]',
      habits: '&id,sortOrder,updatedAt',
      habitEntries: '&id,habitId,date,status,updatedAt,[habitId+date],[habitId+status]',
      timeBlocks: '&id,taskId,start,end,kind,updatedAt',
      dailyPlans: '&date,status,updatedAt',
      dailyPlanItems: '&id,date,taskId,bucket,updatedAt,[date+bucket],[date+taskId]',
      focusSessions: '&id,taskId,projectIdSnapshot,startedAt,endedAt,status,[status+startedAt]',
      recurringSeries: '&id,status,startDate,timezone,updatedAt,[status+startDate]',
      settings: '&key,updatedAt',
      importBatches: '&id,createdAt,status,source',
      patchBatches: '&id,createdAt,status,source',
      calendarImportBatches: '&id,createdAt,status,source',
      reviewRecords: '&id,kind,periodStart,periodEnd,updatedAt,[kind+periodStart]',
    }).upgrade(migrateV15ToV16)

    this.version(17).stores({
      tasks: '&id,status,plannedDate,deadline,projectId,parentTaskId,seriesId,recurrenceDate,*blockedByTaskIds,*tags,pinned,deletedAt,updatedAt,[status+plannedDate],[seriesId+recurrenceDate]',
      projects: '&id,name,type,status,deadline,archived,favorite,updatedAt,[archived+favorite]',
      habits: '&id,sortOrder,updatedAt',
      habitEntries: '&id,habitId,date,status,updatedAt,[habitId+date],[habitId+status]',
      timeBlocks: '&id,taskId,start,end,kind,updatedAt',
      dailyPlans: '&date,status,updatedAt',
      dailyPlanItems: '&id,date,taskId,bucket,updatedAt,[date+bucket],[date+taskId]',
      focusSessions: '&id,taskId,projectIdSnapshot,startedAt,endedAt,status,[status+startedAt]',
      recurringSeries: '&id,status,startDate,timezone,updatedAt,[status+startDate]',
      settings: '&key,updatedAt',
      importBatches: '&id,createdAt,status,source',
      patchBatches: '&id,createdAt,status,source',
      calendarImportBatches: '&id,createdAt,status,source',
      reviewRecords: '&id,kind,periodStart,periodEnd,updatedAt,[kind+periodStart]',
    }).upgrade(migrateV16ToV17)
  }
}

export const db = new ProductivityDatabase()
