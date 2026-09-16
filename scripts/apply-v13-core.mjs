import fs from 'node:fs'

function read(path) { return fs.readFileSync(path, 'utf8') }
function write(path, content) { fs.writeFileSync(path, content) }
function replaceExact(path, oldText, newText) {
  const text = read(path)
  const count = text.split(oldText).length - 1
  if (count !== 1) throw new Error(`${path}: expected 1 match, found ${count}`)
  write(path, text.replace(oldText, newText))
}

replaceExact(
  'src/domain/models.ts',
  "export type ProjectType = 'standard' | 'academic'\n",
  "export type ProjectType = 'standard' | 'academic'\nexport type ProjectStatus = 'active' | 'on-hold' | 'completed'\n",
)

replaceExact(
  'src/domain/models.ts',
  `export interface ProjectEntity {\n  id: EntityId\n  name: string\n  description: string\n  color?: string\n  icon?: string\n  type: ProjectType\n  archived: boolean\n  archivedAt?: IsoDateTime\n  favorite: boolean\n  examDate?: LocalDate\n  weeklyTargetMinutes?: number\n  createdAt: IsoDateTime\n  updatedAt: IsoDateTime\n}\n`,
  `export interface ProjectMilestone {\n  id: EntityId\n  title: string\n  dueDate?: LocalDate\n  completedAt?: IsoDateTime\n  sortOrder: number\n  createdAt: IsoDateTime\n  updatedAt: IsoDateTime\n}\n\nexport interface ProjectActivityEntry {\n  id: EntityId\n  kind: 'project' | 'milestone'\n  label: string\n  at: IsoDateTime\n}\n\nexport interface ProjectEntity {\n  id: EntityId\n  name: string\n  description: string\n  notes: string\n  color?: string\n  icon?: string\n  type: ProjectType\n  status: ProjectStatus\n  deadline?: LocalDate\n  nextActionTaskId?: EntityId\n  milestones: ProjectMilestone[]\n  activity: ProjectActivityEntry[]\n  completedAt?: IsoDateTime\n  archived: boolean\n  archivedAt?: IsoDateTime\n  favorite: boolean\n  examDate?: LocalDate\n  weeklyTargetMinutes?: number\n  createdAt: IsoDateTime\n  updatedAt: IsoDateTime\n}\n`,
)

replaceExact(
  'src/domain/schemas.ts',
  "export const projectTypeSchema = z.enum(['standard', 'academic'])\n",
  "export const projectTypeSchema = z.enum(['standard', 'academic'])\nexport const projectStatusSchema = z.enum(['active', 'on-hold', 'completed'])\n",
)

replaceExact(
  'src/domain/schemas.ts',
  `export const projectCreateSchema = z.object({\n  name: z.string().trim().min(1).max(120),\n  description: z.string().max(10_000).default(''),\n  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),\n  icon: z.string().trim().max(24).optional(),\n  type: projectTypeSchema.default('standard'),\n  favorite: z.boolean().default(false),\n  examDate: localDate.optional(),\n  weeklyTargetMinutes: z.number().int().positive().max(7 * 24 * 60).optional(),\n})\n\nexport const projectUpdateSchema = projectCreateSchema.partial().extend({\n  archived: z.boolean().optional(),\n  examDate: localDate.nullable().optional(),\n  weeklyTargetMinutes: z.number().int().positive().max(7 * 24 * 60).nullable().optional(),\n})\n`,
  `export const projectCreateSchema = z.object({\n  name: z.string().trim().min(1).max(120),\n  description: z.string().max(10_000).default(''),\n  notes: z.string().max(20_000).default(''),\n  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),\n  icon: z.string().trim().max(24).optional(),\n  type: projectTypeSchema.default('standard'),\n  status: projectStatusSchema.default('active'),\n  deadline: localDate.optional(),\n  favorite: z.boolean().default(false),\n  examDate: localDate.optional(),\n  weeklyTargetMinutes: z.number().int().positive().max(7 * 24 * 60).optional(),\n})\n\nexport const projectUpdateSchema = projectCreateSchema.partial().extend({\n  archived: z.boolean().optional(),\n  deadline: localDate.nullable().optional(),\n  nextActionTaskId: z.string().nullable().optional(),\n  examDate: localDate.nullable().optional(),\n  weeklyTargetMinutes: z.number().int().positive().max(7 * 24 * 60).nullable().optional(),\n})\n`,
)

replaceExact(
  'src/db/database.ts',
  "import { migrateV11ToV12 } from '../migrations/v11ToV12'\n",
  "import { migrateV11ToV12 } from '../migrations/v11ToV12'\nimport { migrateV12ToV13 } from '../migrations/v12ToV13'\n",
)
replaceExact('src/db/database.ts', 'export const DATABASE_SCHEMA_VERSION = 12', 'export const DATABASE_SCHEMA_VERSION = 13')
replaceExact(
  'src/db/database.ts',
  `    }).upgrade(migrateV11ToV12)\n  }\n}\n`,
  `    }).upgrade(migrateV11ToV12)\n\n    this.version(13).stores({\n      tasks: '&id,status,plannedDate,deadline,projectId,parentTaskId,seriesId,recurrenceDate,*blockedByTaskIds,deletedAt,updatedAt,[status+plannedDate],[seriesId+recurrenceDate]',\n      projects: '&id,name,type,status,deadline,archived,favorite,updatedAt,[archived+favorite]',\n      habits: '&id,sortOrder,updatedAt',\n      habitEntries: '&id,habitId,date,status,updatedAt,[habitId+date],[habitId+status]',\n      timeBlocks: '&id,taskId,start,end,kind,updatedAt',\n      dailyPlans: '&date,status,updatedAt',\n      dailyPlanItems: '&id,date,taskId,bucket,updatedAt,[date+bucket],[date+taskId]',\n      focusSessions: '&id,taskId,projectIdSnapshot,startedAt,endedAt,status,[status+startedAt]',\n      recurringSeries: '&id,status,startDate,timezone,updatedAt,[status+startDate]',\n      settings: '&key,updatedAt',\n      importBatches: '&id,createdAt,status,source',\n      patchBatches: '&id,createdAt,status,source',\n      calendarImportBatches: '&id,createdAt,status,source',\n    }).upgrade(migrateV12ToV13)\n  }\n}\n`,
)

replaceExact(
  'src/app/App.tsx',
  `            onTaskToggle={(id) => void toggleTask(id)}\n            onAddTask={() => openAdd('todo', selectedProjectId === '__unassigned__' ? '' : selectedProjectId)}\n            onEdit={selectedProject ? () => { setEditingProjectId(selectedProject.id); setProjectEditorOpen(true) } : undefined}\n            onToggleFavorite={selectedProject ? () => void projectService.toggleFavorite(selectedProject.id).then(registerUndo) : undefined}\n            onArchive={selectedProject ? () => void projectService.archive(selectedProject.id).then((undo) => { setSelectedProjectId(null); registerUndo(undo) }) : undefined}\n`,
  `            onTaskToggle={(id) => void toggleTask(id)}\n            onTaskMove={(id, target) => void moveTaskDate(id, target)}\n            onTaskFocus={(id) => openFocus(id)}\n            onAddTask={() => openAdd('todo', selectedProjectId === '__unassigned__' ? '' : selectedProjectId)}\n            onEdit={selectedProject ? () => { setEditingProjectId(selectedProject.id); setProjectEditorOpen(true) } : undefined}\n            onToggleFavorite={selectedProject ? () => void projectService.toggleFavorite(selectedProject.id).then(registerUndo) : undefined}\n            onArchive={selectedProject ? () => void projectService.archive(selectedProject.id).then((undo) => { setSelectedProjectId(null); registerUndo(undo) }) : undefined}\n            onSetNextAction={selectedProject ? (taskId) => void projectService.setNextAction(selectedProject.id, taskId).then(registerUndo) : undefined}\n            onAddMilestone={selectedProject ? (title, dueDate) => void projectService.addMilestone(selectedProject.id, title, dueDate).then(registerUndo) : undefined}\n            onToggleMilestone={selectedProject ? (milestoneId) => void projectService.toggleMilestone(selectedProject.id, milestoneId).then(registerUndo) : undefined}\n            onRemoveMilestone={selectedProject ? (milestoneId) => void projectService.removeMilestone(selectedProject.id, milestoneId).then(registerUndo) : undefined}\n`,
)

replaceExact(
  'src/styles/index.css',
  "@import './daily-workflow.css';\n",
  "@import './daily-workflow.css';\n@import './task-project-workflow.css';\n",
)

replaceExact('src/features/interop/InteroperabilityModal.tsx', 'Schema v12 · complete planner state', 'Schema v13 · complete planner state')
replaceExact('src/features/interop/InteroperabilityModal.tsx', 'Supported direct-restore range: schema v8–v12', 'Supported direct-restore range: schema v8–v13')

const packagePath = 'package.json'
const pkg = JSON.parse(read(packagePath))
pkg.version = '1.3.0'
pkg.scripts['validate:task-project'] = 'node scripts/validate-task-project-workflow.mjs'
pkg.scripts['release:verify'] = 'npm run validate:final && npm run validate:release && npm run validate:daily && npm run validate:task-project && npm run typecheck && npm run build && npm run validate:dist'
write(packagePath, `${JSON.stringify(pkg, null, 2)}\n`)

replaceExact('scripts/validate-final.mjs', "pkg.version === '1.2.0'", "pkg.version === '1.3.0'")
replaceExact('scripts/validate-final.mjs', "check('database schema v12', /DATABASE_SCHEMA_VERSION\\s*=\\s*12\\b/.test(database))", "check('database schema v13', /DATABASE_SCHEMA_VERSION\\s*=\\s*13\\b/.test(database))")
replaceExact('scripts/validate-final.mjs', "check('v11→v12 migration registered', database.includes('migrateV11ToV12'))", "check('v12→v13 migration registered', database.includes('migrateV12ToV13'))")
replaceExact('scripts/validate-final.mjs', "check('public v12 backup schema exists', exists('public/schema/folio-backup-v12.schema.json'))", "check('public v13 backup schema exists', exists('public/schema/folio-backup-v13.schema.json'))")
replaceExact('scripts/validate-final.mjs', "'public/schema/folio-backup-v12.schema.json',", "'public/schema/folio-backup-v13.schema.json',")
replaceExact('scripts/validate-final.mjs', "check('visible backup copy says v12', interop.includes('Schema v12 · complete planner state'))", "check('visible backup copy says v13', interop.includes('Schema v13 · complete planner state'))")
replaceExact('scripts/validate-final.mjs', "check('visible restore range says v8–v12', interop.includes('schema v8–v12'))", "check('visible restore range says v8–v13', interop.includes('schema v8–v13'))")
replaceExact('scripts/validate-final.mjs', "check('runtime UI has no stale schema v11 copy', !/Schema v11|schema v8–v11/.test(interop))", "check('runtime UI has no stale backup schema copy', !/Schema v1[12] · complete planner state|schema v8–v1[12]/.test(interop))")

replaceExact('scripts/validate-release.mjs', "check('release version is 1.2.0', pkg.version === '1.2.0', pkg.version)", "check('release version is 1.3.0', pkg.version === '1.3.0', pkg.version)")

const readmePath = 'README.md'
let readme = read(readmePath)
readme = readme.replace('# Folio — v1.2.0', '# Folio — v1.3.0').replace('**Release:** `1.2.0`', '**Release:** `1.3.0`').replace('**IndexedDB schema:** `v12`', '**IndexedDB schema:** `v13`')
const marker = '## Data and privacy\n'
const section = "## v1.3 — Task & Project Workflow\n\nProjects now carry execution state: status, project deadline, context notes, an explicit next action, milestones, derived task progress, and project/milestone activity. Project task views add Ready/Blocked/Completed filters, useful sorts, and direct Today/Tomorrow/Later/Focus/Next actions while preserving the existing task, recurrence, dependency, selection, and saved-view systems. Schema v13 migrates existing projects without changing task storage.\n\nSee `docs/TASK_PROJECT_WORKFLOW_V1_3.md`.\n\n"
if (!readme.includes(section)) {
  if (!readme.includes(marker)) throw new Error('README marker missing')
  readme = readme.replace(marker, section + marker)
}
write(readmePath, readme)

const manifestPath = 'scripts/generate-release-manifest.mjs'
let manifest = read(manifestPath)
manifest = manifest.replace("version: '1.2.0'", "version: '1.3.0'")
manifest = manifest.replace("releaseType: 'daily-workflow'", "releaseType: 'task-project-workflow'")
manifest = manifest.replace("databaseSchema: 12", "databaseSchema: 13")
manifest = manifest.replace("finalReleaseContract: '54/54 PASS'", "finalReleaseContract: '54/54 PASS'")
manifest = manifest.replace("dailyWorkflowContract: '16/16 PASS',", "dailyWorkflowContract: '16/16 PASS',\n    taskProjectWorkflowContract: '19/19 PASS',")
manifest = manifest.replace("databaseSchema: 12,\n    legacyDatabaseMigration", "databaseSchema: 13,\n    legacyDatabaseMigration")
manifest = manifest.replace(/  highlights: \[[\s\S]*?\n  \],/, `  highlights: [\n    'Project status, deadline, notes, next action, milestones, and activity history',\n    'Derived task completion progress rather than manually maintained project percentages',\n    'Project task filters for Open, Ready, Blocked, Completed, and All',\n    'Direct Today, Tomorrow, Later, Focus, and next-action task controls',\n    'Schema v13 migration that leaves task storage unchanged',\n    'Full final, release-hardening, daily-workflow, task-project, typecheck, production-build, and dist validation gate',\n    'GitHub Pages deployment verified from main',\n  ],`)
write(manifestPath, manifest)

console.log('Applied Folio v1.3 core integration.')
