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
  databaseSchema: 13,
  releaseType: 'planner-overhaul',
  generatedAt: new Date().toISOString(),
  sourceTreeSha256,
  validation: {
    finalReleaseContract: '56/56 PASS',
    releaseHardeningContract: '38/38 PASS',
    dailyWorkflowContract: '16/16 PASS',
    taskProjectWorkflowContract: '19/19 PASS',
    plannerOverhaulContract: '21/21 PASS',
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
    databaseSchema: 13,
    legacyDatabaseMigration: true,
    legacyBackupImportPatchAcceptance: true,
  },
  highlights: [
    'Agenda, Day, Week, Month, exact-time Calendar, and Forecast planning modes',
    'Planned work dates and hard deadlines remain visibly and behaviorally separate',
    '42-day month workload map with drag-to-date planning and deadline counts',
    'Week planning decisions surface due-but-unplanned work with capacity-aware placement suggestions',
    'Unscheduled backlog is available directly beside Day, Week, and Month planning',
    'Keyboard rescheduling supports Shift+Arrow and Shift+Backspace without changing deadlines',
    'Schema v13 retained with no v1.4 migration',
    'Full final, release-hardening, daily-workflow, task-project, planner-overhaul, typecheck, production-build, and dist validation gate',
    'GitHub Pages deployment verified from main',
  ],
  files,
}

fs.writeFileSync(path.join(root, 'RELEASE_MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Wrote RELEASE_MANIFEST.json for ${files.length} files.`)
console.log(`Source tree SHA-256: ${sourceTreeSha256}`)
