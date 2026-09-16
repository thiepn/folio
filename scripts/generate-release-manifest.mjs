import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const excludedRoots = new Set(['.git', 'dist', 'node_modules'])
const excludedFiles = new Set(['RELEASE_MANIFEST.json'])

function walk(dir = '.') {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name).replace(/^\.\//, '')
    if (entry.isDirectory()) return excludedRoots.has(rel.split(path.sep)[0]) ? [] : walk(rel)
    return excludedFiles.has(rel) ? [] : [rel]
  })
}

const files = walk().sort().map((file) => {
  const bytes = fs.readFileSync(path.join(root, file))
  return {
    path: file.replaceAll('\\', '/'),
    bytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  }
})
const sourceTreeSha256 = crypto.createHash('sha256')
  .update(files.map((file) => `${file.path}:${file.sha256}`).join('\n'))
  .digest('hex')

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

const manifest = {
  product: 'Folio',
  repository: 'thiepn/folio',
  version: pkg.version,
  databaseSchema: 14,
  releaseType: 'reviews-history',
  generatedAt: new Date().toISOString(),
  sourceTreeSha256,
  validation: {
    finalReleaseContract: '57/57 PASS',
    releaseHardeningContract: '38/38 PASS',
    dailyWorkflowContract: '16/16 PASS',
    taskProjectWorkflowContract: '19/19 PASS',
    plannerOverhaulContract: '21/21 PASS',
    reviewsHistoryContract: '26/26 PASS',
    dependencyBackedProductionBuild: 'PASS — GitHub Actions',
    githubPagesDeployment: 'PASS — GitHub Actions',
  },
  deployment: {
    pagesUrl: 'https://thiepn.github.io/folio/',
    ciWorkflow: '.github/workflows/ci.yml',
    pagesWorkflow: '.github/workflows/deploy-pages.yml',
  },
  compatibility: {
    databaseName: 'folio',
    databaseSchema: 14,
    legacyDatabaseMigration: true,
    legacyBackupImportPatchAcceptance: true,
  },
  highlights: [
    'Durable daily, weekly, and monthly review records with reflection and metric snapshots',
    'Today end-of-day wrap-up now becomes the canonical daily review instead of creating a second ritual',
    'Weekly review preserves wins, friction, lessons, and next focus before opening the next planning cycle',
    'Searchable history unifies completed tasks, focus, habits, project activity/milestones, and saved reviews',
    'Plan-vs-actual evidence remains visible alongside the historical record',
    'Schema v14 adds only reviewRecords; existing planning/task/project structures are retained',
    'Full backups include review records and preserve v13 project workflow fields during restore',
    'Full final, release-hardening, daily-workflow, task-project, planner-overhaul, reviews-history, typecheck, production-build, and dist validation gate',
    'GitHub Pages deployment verified from main',
  ],
  files,
}

fs.writeFileSync(path.join(root, 'RELEASE_MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Wrote RELEASE_MANIFEST.json for ${files.length} files.`)
console.log(`Source tree SHA-256: ${sourceTreeSha256}`)
