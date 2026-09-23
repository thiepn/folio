import { settingsRepository } from '../repositories/settingsRepository'
import type { TaskPriority } from '../domain/models'
import {
  SMART_FIELD_OPERATORS,
  type SmartFilterCondition, type SmartFilterGroup, type SmartFilterNode, type SmartGroupBy,
  type SmartScope, type SmartSortField, type SmartSortRule, type SmartTaskView,
} from '../features/smartViews/queryEngine'
import type { UndoableMutation } from './undo'

const KEY = 'planning.savedViews'
const MAX_VIEWS = 50
const MAX_NODES = 64
const MAX_DEPTH = 5

type LegacyDateMode = 'all' | 'today' | 'next7' | 'next30' | 'overdue' | 'unplanned'
type LegacyDeadlineMode = 'all' | 'overdue' | 'next7' | 'next30' | 'none'
type LegacyBlockMode = 'all' | 'ready' | 'blocked'
type LegacyStatusMode = 'open' | 'completed' | 'all'

interface LegacySavedTaskView {
  id?: string
  name?: string
  query?: string
  projectIds?: string[]
  priorities?: TaskPriority[]
  dateMode?: LegacyDateMode
  deadlineMode?: LegacyDeadlineMode
  blockMode?: LegacyBlockMode
  statusMode?: LegacyStatusMode
  createdAt?: string
  updatedAt?: string
}

export type SmartTaskViewInput = Omit<SmartTaskView, 'id' | 'createdAt' | 'updatedAt' | 'builtin'> & { id?: string }

const allowedFields = new Set([
  'text','status','priority','project','list','section','tag','planned','deadline',
  'recurring','readiness','estimate','reminder','pinned','completion',
])
const allowedSortFields = new Set<SmartSortField>(['manual','planned','deadline','priority','estimate','title','created','updated'])
const allowedGroups = new Set<SmartGroupBy>(['none','project','list','section','priority','planned','deadline','tag','status','readiness'])

function normalizeName(name: unknown) {
  const value = typeof name === 'string' ? name.trim() : ''
  if (!value) throw new Error('Smart view name is required.')
  return value.slice(0, 80)
}

function normalizeDescription(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, 240) : undefined
}

function cleanValue(value: unknown): SmartFilterCondition['value'] {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) {
    const strings = value.filter((item): item is string => typeof item === 'string').slice(0, 50)
    if (strings.length === value.length) return strings
    const numbers = value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item)).slice(0, 2)
    if (numbers.length === value.length && numbers.length === 2) return [numbers[0], numbers[1]]
  }
  return undefined
}

function normalizeCondition(raw: any): SmartFilterCondition {
  const field = (allowedFields.has(raw?.field) ? raw.field : 'status') as keyof typeof SMART_FIELD_OPERATORS
  const compatibleOperators = SMART_FIELD_OPERATORS[field]
  const operator = compatibleOperators.includes(raw?.operator) ? raw.operator : compatibleOperators[0]
  return {
    id: typeof raw?.id === 'string' && raw.id ? raw.id : crypto.randomUUID(),
    type: 'condition',
    field,
    operator,
    value: cleanValue(raw?.value),
    includeDescendants: field === 'tag' ? Boolean(raw?.includeDescendants) : undefined,
  }
}

function normalizeGroup(raw: any, depth = 0, counter = { value: 0 }): SmartFilterGroup {
  counter.value += 1
  if (counter.value > MAX_NODES) throw new Error(`Smart views support at most ${MAX_NODES} filter nodes.`)
  if (depth >= MAX_DEPTH) throw new Error(`Smart view filter nesting is limited to ${MAX_DEPTH} levels.`)
  const children: SmartFilterNode[] = []
  for (const child of Array.isArray(raw?.children) ? raw.children : []) {
    if (counter.value >= MAX_NODES) break
    if (child?.type === 'group') children.push(normalizeGroup(child, depth + 1, counter))
    else {
      counter.value += 1
      if (counter.value > MAX_NODES) break
      children.push(normalizeCondition(child))
    }
  }
  return {
    id: typeof raw?.id === 'string' && raw.id ? raw.id : crypto.randomUUID(),
    type: 'group',
    operator: raw?.operator === 'or' ? 'or' : 'and',
    negated: Boolean(raw?.negated),
    children,
  }
}

function normalizeSort(raw: unknown): SmartSortRule[] {
  const rows = Array.isArray(raw) ? raw : []
  const result: SmartSortRule[] = []
  for (const item of rows.slice(0, 4)) {
    if (!item || typeof item !== 'object') continue
    const field = allowedSortFields.has((item as any).field) ? (item as any).field as SmartSortField : undefined
    if (!field || result.some((row) => row.field === field)) continue
    result.push({ field, direction: (item as any).direction === 'desc' ? 'desc' : 'asc' })
  }
  return result
}

function legacyCondition(field: SmartFilterCondition['field'], operator: SmartFilterCondition['operator'], value?: SmartFilterCondition['value']): SmartFilterCondition {
  return { id: crypto.randomUUID(), type:'condition', field, operator, value }
}

function migrateLegacy(raw: LegacySavedTaskView): SmartTaskView {
  const children: SmartFilterNode[] = []
  if (raw.query?.trim()) children.push(legacyCondition('text','contains',raw.query.trim()))
  if (raw.projectIds?.length) children.push(legacyCondition('project','in',raw.projectIds))
  if (raw.priorities?.length) children.push(legacyCondition('priority','in',raw.priorities))

  const dateMode = raw.dateMode ?? 'all'
  if (dateMode === 'today') children.push(legacyCondition('planned','today'))
  if (dateMode === 'next7') children.push(legacyCondition('planned','within-next',7))
  if (dateMode === 'next30') children.push(legacyCondition('planned','within-next',30))
  if (dateMode === 'overdue') {
    children.push(legacyCondition('planned','overdue'))
    children.push(legacyCondition('status','is','todo'))
  }
  if (dateMode === 'unplanned') children.push(legacyCondition('planned','not-exists'))

  const deadlineMode = raw.deadlineMode ?? 'all'
  if (deadlineMode === 'overdue') {
    children.push(legacyCondition('deadline','overdue'))
    children.push(legacyCondition('status','is','todo'))
  }
  if (deadlineMode === 'next7') children.push(legacyCondition('deadline','within-next',7))
  if (deadlineMode === 'next30') children.push(legacyCondition('deadline','within-next',30))
  if (deadlineMode === 'none') children.push(legacyCondition('deadline','not-exists'))

  const blockMode = raw.blockMode ?? 'all'
  if (blockMode === 'ready') children.push(legacyCondition('readiness','is','ready'))
  if (blockMode === 'blocked') children.push(legacyCondition('readiness','is','blocked'))

  const statusMode = raw.statusMode ?? 'open'
  if (statusMode === 'open') children.push(legacyCondition('status','is','todo'))
  if (statusMode === 'completed') children.push(legacyCondition('status','is','completed'))
  if (statusMode === 'all') children.push(legacyCondition('status','in',['todo','completed']))

  const now = new Date().toISOString()
  return {
    id: raw.id || crypto.randomUUID(),
    name: normalizeName(raw.name),
    description: 'Migrated from the legacy Saved Views filter.',
    pinned: false,
    scope: 'root',
    query: { id: crypto.randomUUID(), type:'group', operator:'and', children },
    sort: [{ field:'deadline', direction:'asc' },{ field:'planned', direction:'asc' }],
    groupBy: 'none',
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || now,
  }
}

function isSmartView(raw: any) {
  return raw && typeof raw === 'object' && raw.query?.type === 'group' && typeof raw.name === 'string'
}

function normalizeSmartView(raw: any): SmartTaskView {
  if (!isSmartView(raw)) return migrateLegacy(raw ?? {})
  const now = new Date().toISOString()
  const scope: SmartScope = raw.scope === 'all' ? 'all' : 'root'
  const groupBy = allowedGroups.has(raw.groupBy) ? raw.groupBy as SmartGroupBy : 'none'
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : crypto.randomUUID(),
    name: normalizeName(raw.name),
    description: normalizeDescription(raw.description),
    color: typeof raw.color === 'string' && /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : undefined,
    icon: typeof raw.icon === 'string' ? raw.icon.slice(0,24) : undefined,
    pinned: Boolean(raw.pinned),
    scope,
    query: normalizeGroup(raw.query),
    sort: normalizeSort(raw.sort),
    groupBy,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
  }
}

async function currentViews() {
  const raw = await settingsRepository.get<unknown>(KEY, [])
  if (!Array.isArray(raw)) return []
  const normalized: SmartTaskView[] = []
  for (const item of raw.slice(0, MAX_VIEWS)) {
    try { normalized.push(normalizeSmartView(item)) } catch { /* Skip corrupt view records without breaking the app. */ }
  }
  const serializedRaw = JSON.stringify(raw)
  const serializedNormalized = JSON.stringify(normalized)
  if (serializedRaw !== serializedNormalized) await settingsRepository.set(KEY, normalized)
  return normalized
}

export const savedViewService = {
  async list() {
    return currentViews()
  },

  async save(view: SmartTaskViewInput): Promise<UndoableMutation> {
    const previous = await currentViews()
    const now = new Date().toISOString()
    const id = view.id ?? crypto.randomUUID()
    const existing = previous.find((item) => item.id === id)
    const nextView = normalizeSmartView({
      ...view,
      id,
      name: normalizeName(view.name),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    })
    const duplicateName = previous.find((item) => item.id !== id && item.name.toLocaleLowerCase() === nextView.name.toLocaleLowerCase())
    if (duplicateName) throw new Error('A smart view with that name already exists.')
    const next = existing ? previous.map((item) => item.id === id ? nextView : item) : [...previous, nextView]
    if (next.length > MAX_VIEWS) throw new Error(`Keep smart views to ${MAX_VIEWS} or fewer.`)
    await settingsRepository.set(KEY, next)
    return { message: existing ? 'Smart view updated' : 'Smart view created', undo: async () => { await settingsRepository.set(KEY, previous) } }
  },

  async remove(id: string): Promise<UndoableMutation> {
    const previous = await currentViews()
    const next = previous.filter((item) => item.id !== id)
    if (next.length === previous.length) throw new Error('Smart view not found.')
    await settingsRepository.set(KEY, next)
    return { message: 'Smart view removed', undo: async () => { await settingsRepository.set(KEY, previous) } }
  },

  async duplicate(id: string): Promise<{ id: string; undo: UndoableMutation }> {
    const previous = await currentViews()
    const source = previous.find((item) => item.id === id)
    if (!source) throw new Error('Smart view not found.')
    if (previous.length >= MAX_VIEWS) throw new Error(`Keep smart views to ${MAX_VIEWS} or fewer.`)
    const now = new Date().toISOString()
    let name = `${source.name} copy`
    let suffix = 2
    while (previous.some((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) name = `${source.name} copy ${suffix++}`
    const copy: SmartTaskView = {
      ...structuredClone(source),
      id: crypto.randomUUID(),
      name,
      pinned: false,
      query: normalizeGroup(source.query),
      createdAt: now,
      updatedAt: now,
    }
    await settingsRepository.set(KEY,[...previous,copy])
    return { id:copy.id, undo:{ message:'Smart view duplicated', undo:async()=>{ await settingsRepository.set(KEY,previous) } } }
  },

  async duplicateDefinition(source: SmartTaskView): Promise<{ id: string; undo: UndoableMutation }> {
    const previous = await currentViews()
    if (previous.length >= MAX_VIEWS) throw new Error(`Keep smart views to ${MAX_VIEWS} or fewer.`)
    const now = new Date().toISOString()
    let name = `${source.name} copy`
    let suffix = 2
    while (previous.some((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) name = `${source.name} copy ${suffix++}`
    const copy = normalizeSmartView({
      ...structuredClone(source),
      id: crypto.randomUUID(),
      builtin: undefined,
      name,
      pinned: false,
      createdAt: now,
      updatedAt: now,
    })
    await settingsRepository.set(KEY,[...previous,copy])
    return { id:copy.id, undo:{ message:'Smart view duplicated', undo:async()=>{ await settingsRepository.set(KEY,previous) } } }
  },

  async togglePin(id:string): Promise<UndoableMutation> {
    const previous=await currentViews()
    const current=previous.find((item)=>item.id===id)
    if(!current) throw new Error('Smart view not found.')
    const next=previous.map((item)=>item.id===id?{...item,pinned:!item.pinned,updatedAt:new Date().toISOString()}:item)
    await settingsRepository.set(KEY,next)
    return {message:current.pinned?'Smart view unpinned':'Smart view pinned',undo:async()=>{await settingsRepository.set(KEY,previous)}}
  },
}
