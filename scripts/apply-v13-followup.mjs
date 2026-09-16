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
  'scripts/validate-daily-workflow.mjs',
  "check('v1.2 package version', pkg.version === '1.2.0')",
  "check('v1.2+ package version', Number(pkg.version.split('.')[1] ?? 0) >= 2)",
)
replaceExact(
  'scripts/validate-daily-workflow.mjs',
  "check('v12 data model retained', /DATABASE_SCHEMA_VERSION\\s*=\\s*12\\b/.test(database))",
  "check('daily workflow compatible schema', Number(database.match(/DATABASE_SCHEMA_VERSION\\s*=\\s*(\\d+)/)?.[1] ?? 0) >= 12)",
)

{
  const path = 'src/db/seed.ts'
  const text = read(path)
  const next = text.replace(/(description: '[^']*', )color:/g, "$1notes: '', status: 'active', milestones: [], activity: [], color:")
  const count = (next.match(/notes: '', status: 'active', milestones: \[\], activity: \[\], color:/g) ?? []).length
  if (count !== 4) throw new Error(`${path}: expected 4 v13 demo projects, found ${count}`)
  write(path, next)
}

for (const path of ['src/features/planner/advancedPlanningCases.ts', 'src/features/review/reviewLogicCases.ts']) {
  replaceExact(
    path,
    "description: '', type: 'academic'",
    "description: '', notes: '', type: 'academic', status: 'active', milestones: [], activity: []",
  )
}

replaceExact(
  'src/services/entityFactory.ts',
  `    description: parsed.description,
    color: parsed.color,
    icon: parsed.icon,
    type: parsed.type,
    archived: false,
    favorite: parsed.favorite,`,
  `    description: parsed.description,
    notes: parsed.notes,
    color: parsed.color,
    icon: parsed.icon,
    type: parsed.type,
    status: parsed.status,
    deadline: parsed.deadline,
    milestones: [],
    activity: [{ id: crypto.randomUUID(), kind: 'project', label: 'Project created', at: now }],
    completedAt: parsed.status === 'completed' ? now : undefined,
    archived: false,
    favorite: parsed.favorite,`,
)

console.log('Applied Folio v1.3 follow-up constructor and compatibility fixes.')
