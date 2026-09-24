import { db } from '../db/database'
import { habitScheduleLabel } from '../domain/habit'
import type {
  HabitEntity, NoteEntity, ProjectEntity, ReviewRecordEntity, SearchDocumentEntity,
  SearchOwnerType, TagEntity, TaskEntity,
} from '../domain/models'

export type SearchSort = 'relevance' | 'recent' | 'title'
export type SearchStatusFilter = 'all' | 'open' | 'completed'

export interface SearchFilters {
  types?: SearchOwnerType[]
  projectId?: string
  tagId?: string
  status?: SearchStatusFilter
  includeArchived?: boolean
  updatedWithinDays?: number
  dateFrom?: string
  dateTo?: string
  sort?: SearchSort
}

export interface ContentSearchHit {
  ownerType: SearchOwnerType
  ownerId: string
  title: string
  snippet: string
  meta?: string
  updatedAt: string
  score: number
  projectId?: string
  status?: string
  tagIds?: string[]
  date?: string
  archived?: boolean
  matchedFields: string[]
}

interface ParsedQuery {
  terms: string[]
  types: SearchOwnerType[]
  status?: SearchStatusFilter
  includeArchived?: boolean
  dateFrom?: string
  dateTo?: string
}

const SEARCH_FINGERPRINT_KEY = 'search.index.fingerprint.v2'
const OWNER_TYPES: SearchOwnerType[] = ['task', 'note', 'project', 'habit', 'review', 'tag']
let documentCache: SearchDocumentEntity[] | null = null
let lastEnsureAt = 0

export function markdownToSearchText(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/`/g, ' '))
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 $2')
    .replace(/[*_~#>\x60]/g, ' ')
    .replace(/\[(?: |x|X)\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeSearchText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isoDate(value?: string) { return value?.slice(0, 10) }

function tokenizeQuery(value: string) {
  const tokens: string[] = []
  for (const match of value.matchAll(/"([^"]+)"|(\S+)/g)) tokens.push((match[1] ?? match[2]).trim())
  return tokens.filter(Boolean)
}

export function parseSearchQuery(value: string): ParsedQuery {
  const terms: string[] = []
  const types: SearchOwnerType[] = []
  let status: SearchStatusFilter | undefined
  let includeArchived: boolean | undefined
  let dateFrom: string | undefined
  let dateTo: string | undefined
  for (const raw of tokenizeQuery(value)) {
    const token = raw.toLocaleLowerCase()
    if (token.startsWith('type:')) {
      const type = token.slice(5) as SearchOwnerType
      if (OWNER_TYPES.includes(type) && !types.includes(type)) types.push(type)
      continue
    }
    if (token === 'status:open' || token === 'is:open') { status = 'open'; continue }
    if (token === 'status:completed' || token === 'is:completed' || token === 'is:done') { status = 'completed'; continue }
    if (token === 'is:archived') { includeArchived = true; continue }
    if (/^after:\d{4}-\d{2}-\d{2}$/.test(token)) { dateFrom = token.slice(6); continue }
    if (/^before:\d{4}-\d{2}-\d{2}$/.test(token)) { dateTo = token.slice(7); continue }
    terms.push(raw)
  }
  return { terms, types, status, includeArchived, dateFrom, dateTo }
}

async function attachmentIndex(ownerType: 'task' | 'note', ownerId: string) {
  const attachments = await db.attachments.where('[ownerType+ownerId]').equals([ownerType, ownerId]).toArray()
  return {
    text: attachments.map((item) => [item.name, item.mimeType ?? '', item.url ?? ''].join(' ')).join(' '),
    updatedAt: attachments.reduce((latest, item) => item.updatedAt > latest ? item.updatedAt : latest, ''),
  }
}

function tagNames(task: TaskEntity, tags: Map<string, TagEntity>) {
  const structured = (task.tagIds ?? []).map((id) => tags.get(id)?.name).filter((name): name is string => Boolean(name))
  return [...new Set([...(task.tags ?? []), ...structured])]
}

async function taskDocument(task: TaskEntity, projects: Map<string, ProjectEntity>, tags: Map<string, TagEntity>): Promise<SearchDocumentEntity> {
  const attachments = await attachmentIndex('task', task.id)
  const project = task.projectId ? projects.get(task.projectId) : undefined
  const names = tagNames(task, tags)
  const summary = markdownToSearchText(task.description).slice(0, 500)
  return {
    id: 'task:' + task.id,
    ownerType: 'task',
    ownerId: task.id,
    title: task.title,
    summary,
    text: markdownToSearchText([
      task.title, task.description, task.location ?? '', task.sourceUrl ?? '',
      project?.name ?? '', ...names,
      ...(task.checklist ?? []).map((item) => item.text),
      ...(task.comments ?? []).map((comment) => comment.body),
      attachments.text,
    ].join(' ')),
    keywords: [project?.name ?? '', task.priority, task.status, ...names, attachments.text].join(' '),
    projectId: task.projectId,
    status: task.status,
    tagIds: task.tagIds ?? [],
    date: task.deadline ?? task.plannedDate ?? isoDate(task.updatedAt),
    archived: false,
    updatedAt: attachments.updatedAt > task.updatedAt ? attachments.updatedAt : task.updatedAt,
  }
}

async function noteDocument(note: NoteEntity): Promise<SearchDocumentEntity> {
  const attachments = await attachmentIndex('note', note.id)
  const summary = markdownToSearchText(note.body).slice(0, 500)
  return {
    id: 'note:' + note.id, ownerType: 'note', ownerId: note.id,
    title: note.title, summary,
    text: markdownToSearchText([note.title, note.body, attachments.text].join(' ')),
    keywords: attachments.text,
    status: note.archived ? 'archived' : 'active',
    archived: note.archived,
    date: isoDate(note.updatedAt),
    updatedAt: attachments.updatedAt > note.updatedAt ? attachments.updatedAt : note.updatedAt,
  }
}

function projectDocument(project: ProjectEntity): SearchDocumentEntity {
  const summary = markdownToSearchText(project.description || project.notes).slice(0, 500)
  return {
    id: 'project:' + project.id, ownerType: 'project', ownerId: project.id,
    title: project.name, summary,
    text: markdownToSearchText([
      project.name, project.description, project.notes, project.type, project.status,
      ...(project.milestones ?? []).map((item) => item.title),
      ...(project.activity ?? []).map((item) => item.label),
    ].join(' ')),
    keywords: [project.type, project.status, project.icon ?? '', project.deadline ?? '', project.examDate ?? ''].join(' '),
    projectId: project.id,
    status: project.status,
    date: project.examDate ?? project.deadline ?? isoDate(project.updatedAt),
    archived: project.archived,
    updatedAt: project.updatedAt,
  }
}

function habitDocument(habit: HabitEntity, groups: Map<string, string>): SearchDocumentEntity {
  const summary = markdownToSearchText(habit.description).slice(0, 500)
  return {
    id: 'habit:' + habit.id, ownerType: 'habit', ownerId: habit.id,
    title: habit.title, summary,
    text: markdownToSearchText([habit.title, habit.description, habit.unit ?? '', habit.kind, habitScheduleLabel(habit), groups.get(habit.groupId ?? '') ?? ''].join(' ')),
    keywords: [habit.kind, habitScheduleLabel(habit), habit.unit ?? '', groups.get(habit.groupId ?? '') ?? ''].join(' '),
    status: habit.archived ? 'archived' : 'active',
    date: isoDate(habit.updatedAt),
    archived: habit.archived,
    updatedAt: habit.updatedAt,
  }
}

function reviewDocument(review: ReviewRecordEntity): SearchDocumentEntity {
  const summary = markdownToSearchText(review.summary || review.wins || review.nextFocus).slice(0, 500)
  return {
    id: 'review:' + review.id, ownerType: 'review', ownerId: review.id,
    title: review.title, summary,
    text: markdownToSearchText([review.title, review.summary, review.wins, review.friction, review.lessons, review.nextFocus, review.kind, review.periodStart, review.periodEnd].join(' ')),
    keywords: [review.kind, review.periodStart, review.periodEnd].join(' '),
    status: 'completed',
    date: review.periodEnd,
    archived: false,
    updatedAt: review.updatedAt,
  }
}

function tagDocument(tag: TagEntity, tags: Map<string, TagEntity>): SearchDocumentEntity {
  const parent = tag.parentTagId ? tags.get(tag.parentTagId) : undefined
  return {
    id: 'tag:' + tag.id, ownerType: 'tag', ownerId: tag.id,
    title: '#' + tag.name,
    summary: parent ? 'Child of #' + parent.name : 'Tag',
    text: [tag.name, tag.normalizedName, parent?.name ?? ''].join(' '),
    keywords: [tag.favorite ? 'favorite' : '', parent?.name ?? ''].join(' '),
    status: tag.archived ? 'archived' : 'active',
    date: isoDate(tag.updatedAt),
    archived: tag.archived,
    updatedAt: tag.updatedAt,
  }
}

function latestUpdated(rows: Array<{ updatedAt: string }>) {
  return rows.reduce((latest, row) => row.updatedAt > latest ? row.updatedAt : latest, '')
}

function fingerprint(parts: Array<[string, number, string]>) {
  return parts.map(([name, count, updated]) => name + ':' + count + ':' + updated).join('|')
}

async function sourceSnapshot() {
  const [tasks, notes, projects, habits, reviews, tags, groups] = await Promise.all([
    db.tasks.toArray(), db.notes.toArray(), db.projects.toArray(), db.habits.toArray(),
    db.reviewRecords.toArray(), db.tags.toArray(), db.habitGroups.toArray(),
  ])
  const searchableTasks = tasks.filter((task) => !task.deletedAt && task.status !== 'cancelled')
  const searchable = { tasks: searchableTasks, notes, projects, habits, reviews, tags, groups }
  const key = fingerprint([
    ['tasks', searchableTasks.length, latestUpdated(searchableTasks)],
    ['notes', notes.length, latestUpdated(notes)],
    ['projects', projects.length, latestUpdated(projects)],
    ['habits', habits.length, latestUpdated(habits)],
    ['reviews', reviews.length, latestUpdated(reviews)],
    ['tags', tags.length, latestUpdated(tags)],
    ['groups', groups.length, latestUpdated(groups)],
  ])
  return { ...searchable, fingerprint: key }
}

function subsequencePenalty(haystack: string, needle: string): number | null {
  let cursor = 0
  let first = -1
  let last = -1
  for (const char of needle) {
    const next = haystack.indexOf(char, cursor)
    if (next < 0) return null
    if (first < 0) first = next
    last = next
    cursor = next + 1
  }
  return Math.max(0, first) + Math.max(0, last - first - needle.length + 1) * 1.5
}

function editDistance(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 2) return 99
  const prev = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const old = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1))
      diagonal = old
    }
  }
  return prev[b.length]
}

function tokenScore(document: SearchDocumentEntity, token: string) {
  const title = normalizeSearchText(document.title ?? '')
  const summary = normalizeSearchText(document.summary ?? '')
  const keywords = normalizeSearchText(document.keywords ?? '')
  const text = normalizeSearchText(document.text)
  if (title === token) return { score: 140, field: 'title' }
  if (title.startsWith(token)) return { score: 100, field: 'title' }
  if (title.includes(token)) return { score: 76, field: 'title' }
  if (keywords.includes(token)) return { score: 45, field: 'metadata' }
  if (summary.includes(token)) return { score: 32, field: 'summary' }
  if (text.includes(token)) return { score: 20, field: 'content' }

  const words = [...new Set([title, keywords, summary].join(' ').split(/\s+/).filter(Boolean))]
  let bestDistance = 99
  for (const word of words) {
    if (token.length >= 4 && word.length >= 3) bestDistance = Math.min(bestDistance, editDistance(word, token))
  }
  if (bestDistance <= 1) return { score: 13, field: 'fuzzy' }
  if (bestDistance === 2 && token.length >= 6) return { score: 7, field: 'fuzzy' }
  const fuzzy = subsequencePenalty([title, keywords, summary, text].join(' '), token)
  if (fuzzy != null && token.length >= 3) return { score: Math.max(2, 8 - Math.min(6, Math.floor(fuzzy / 5))), field: 'fuzzy' }
  return null
}

function statusMatches(document: SearchDocumentEntity, status: SearchStatusFilter | undefined) {
  if (!status || status === 'all') return true
  if (status === 'completed') return document.status === 'completed'
  return !['completed', 'cancelled', 'archived'].includes(document.status ?? '')
}

function makeSnippet(document: SearchDocumentEntity, terms: string[]) {
  const source = (document.summary || document.text || '').trim()
  if (!source) return ''
  if (!terms.length) return source.slice(0, 220)
  const normalized = normalizeSearchText(source)
  const positions = terms.map((term) => normalized.indexOf(term)).filter((index) => index >= 0)
  if (!positions.length) return source.slice(0, 220)
  const first = Math.min(...positions)
  const start = Math.max(0, first - 70)
  const end = Math.min(source.length, start + 260)
  return (start ? '…' : '') + source.slice(start, end).trim() + (end < source.length ? '…' : '')
}

function typeMeta(type: SearchOwnerType) {
  return type[0].toUpperCase() + type.slice(1)
}

function hydratedMeta(document: SearchDocumentEntity) {
  const parts = [typeMeta(document.ownerType)]
  if (document.status) parts.push(document.status.replace('-', ' '))
  if (document.date) parts.push(document.date)
  return parts.join(' · ')
}

export const contentSearchService = {
  async rebuildAll() {
    const sources = await sourceSnapshot()
    const projectMap = new Map(sources.projects.map((project) => [project.id, project]))
    const tagMap = new Map(sources.tags.map((tag) => [tag.id, tag]))
    const groupMap = new Map(sources.groups.map((group) => [group.id, group.name]))
    const documents: SearchDocumentEntity[] = []
    for (const task of sources.tasks) documents.push(await taskDocument(task, projectMap, tagMap))
    for (const note of sources.notes) documents.push(await noteDocument(note))
    for (const project of sources.projects) documents.push(projectDocument(project))
    for (const habit of sources.habits) documents.push(habitDocument(habit, groupMap))
    for (const review of sources.reviews) documents.push(reviewDocument(review))
    for (const tag of sources.tags) documents.push(tagDocument(tag, tagMap))
    await db.transaction('rw', db.searchDocuments, db.settings, async () => {
      await db.searchDocuments.clear()
      if (documents.length) await db.searchDocuments.bulkPut(documents)
      await db.settings.put({ key: SEARCH_FINGERPRINT_KEY, value: sources.fingerprint, updatedAt: new Date().toISOString() })
    })
    documentCache = documents
    lastEnsureAt = Date.now()
  },

  async indexTask(task: TaskEntity) {
    if (task.deletedAt || task.status === 'cancelled') {
      await db.searchDocuments.delete('task:' + task.id)
      documentCache = null
      return
    }
    const [projects, tags] = await Promise.all([db.projects.toArray(), db.tags.toArray()])
    await db.searchDocuments.put(await taskDocument(task, new Map(projects.map((row) => [row.id, row])), new Map(tags.map((row) => [row.id, row]))))
    documentCache = null
  },

  async indexNote(note: NoteEntity) {
    await db.searchDocuments.put(await noteDocument(note))
    documentCache = null
  },

  async remove(ownerType: SearchOwnerType, ownerId: string) {
    await db.searchDocuments.delete(ownerType + ':' + ownerId)
    documentCache = null
  },

  async rebuildOwner(ownerType: SearchOwnerType, ownerId: string) {
    if (ownerType === 'task') {
      const task = await db.tasks.get(ownerId)
      if (task) return this.indexTask(task)
    }
    if (ownerType === 'note') {
      const note = await db.notes.get(ownerId)
      if (note) return this.indexNote(note)
    }
    await this.rebuildAll()
  },

  async ensureFresh(force = false) {
    if (!force && Date.now() - lastEnsureAt < 1500 && documentCache) return
    const sources = await sourceSnapshot()
    const stored = await db.settings.get(SEARCH_FINGERPRINT_KEY)
    const documents = await db.searchDocuments.toArray()
    const expected = sources.tasks.length + sources.notes.length + sources.projects.length + sources.habits.length + sources.reviews.length + sources.tags.length
    if (stored?.value !== sources.fingerprint || documents.length !== expected) {
      await this.rebuildAll()
      return
    }
    documentCache = documents
    lastEnsureAt = Date.now()
  },

  async search(query: string, filters: SearchFilters = {}, limit = 120): Promise<ContentSearchHit[]> {
    await this.ensureFresh()
    const parsed = parseSearchQuery(query)
    const terms = parsed.terms.map(normalizeSearchText).filter(Boolean)
    const types = parsed.types.length ? parsed.types : filters.types ?? []
    const status = parsed.status ?? filters.status
    const includeArchived = parsed.includeArchived ?? filters.includeArchived ?? false
    const dateFrom = parsed.dateFrom ?? filters.dateFrom
    const dateTo = parsed.dateTo ?? filters.dateTo
    const updatedCutoff = filters.updatedWithinDays ? Date.now() - filters.updatedWithinDays * 86_400_000 : undefined
    const documents = documentCache ?? await db.searchDocuments.toArray()
    const ranked: ContentSearchHit[] = []

    for (const document of documents) {
      if (types.length && !types.includes(document.ownerType)) continue
      if (!includeArchived && document.archived) continue
      if (filters.projectId && document.projectId !== filters.projectId) continue
      if (filters.tagId && !(document.tagIds ?? []).includes(filters.tagId)) continue
      if (!statusMatches(document, status)) continue
      if (updatedCutoff && Date.parse(document.updatedAt) < updatedCutoff) continue
      if (dateFrom && (!document.date || document.date < dateFrom)) continue
      if (dateTo && (!document.date || document.date > dateTo)) continue

      let score = 0
      const matchedFields = new Set<string>()
      let matches = true
      for (const term of terms) {
        const result = tokenScore(document, term)
        if (!result) { matches = false; break }
        score += result.score
        matchedFields.add(result.field)
      }
      if (!matches) continue
      if (!terms.length) score = 1
      const ageDays = Math.max(0, (Date.now() - Date.parse(document.updatedAt)) / 86_400_000)
      score += Math.max(0, 8 - Math.log2(ageDays + 1))
      if (document.ownerType === 'task') score += 2

      ranked.push({
        ownerType: document.ownerType,
        ownerId: document.ownerId,
        title: document.title ?? document.ownerId,
        snippet: makeSnippet(document, terms),
        meta: hydratedMeta(document),
        updatedAt: document.updatedAt,
        score,
        projectId: document.projectId,
        status: document.status,
        tagIds: document.tagIds,
        date: document.date,
        archived: document.archived,
        matchedFields: [...matchedFields],
      })
    }

    const sort = filters.sort ?? 'relevance'
    ranked.sort((a, b) => sort === 'recent'
      ? b.updatedAt.localeCompare(a.updatedAt) || b.score - a.score
      : sort === 'title'
        ? a.title.localeCompare(b.title) || b.score - a.score
        : b.score - a.score || b.updatedAt.localeCompare(a.updatedAt) || a.title.localeCompare(b.title))
    return ranked.slice(0, limit)
  },
}
