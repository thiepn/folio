import type { z } from 'zod'
import type { ImportBatchEntity } from '../../domain/models'
import type { importDocumentSchema } from './importSchema'

export type ImportDocumentV1 = z.infer<typeof importDocumentSchema>

export interface ImportIssue {
  severity: 'error' | 'warning'
  code: string
  message: string
  path?: string
}

export interface ImportDayImpact {
  date: string
  existingMinutes: number
  importedMinutes: number
  capacityMinutes: number
  totalMinutes: number
  overloadedBy: number
}

export interface ImportAnalysis {
  document?: ImportDocumentV1
  issues: ImportIssue[]
  counts: {
    projects: number
    tasks: number
    habits: number
    timeBlocks: number
    recurringSeries: number
    generatedOccurrences: number
  }
  dayImpacts: ImportDayImpact[]
}

export interface ImportHistoryItem extends ImportBatchEntity {}
