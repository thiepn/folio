import type { z } from 'zod'
import type { patchDocumentSchema } from './patchSchema'

export type PatchDocumentV1 = z.infer<typeof patchDocumentSchema>
export type PatchOperationV1 = PatchDocumentV1['operations'][number]

export interface PatchIssue {
  severity: 'error' | 'warning'
  code: string
  message: string
  operationIndex?: number
}

export interface PatchFieldDiff {
  field: string
  before: string
  after: string
}

export interface PatchDiffItem {
  operationIndex: number
  op: 'create' | 'update' | 'delete'
  entity: 'project' | 'task' | 'habit' | 'timeBlock' | 'recurringSeries'
  target: string
  label: string
  effect: string
  destructive: boolean
  fields: PatchFieldDiff[]
}

export interface PatchDayImpact {
  date: string
  beforeMinutes: number
  afterMinutes: number
  capacityMinutes: number
  deltaMinutes: number
  overloadedBy: number
}

export interface PatchAnalysis {
  document?: PatchDocumentV1
  issues: PatchIssue[]
  diffs: PatchDiffItem[]
  destructiveCount: number
  dayImpacts: PatchDayImpact[]
}
