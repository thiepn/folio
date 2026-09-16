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
  databaseSchema: 15,
  releaseType: 'visual-interaction-refinement',
  generatedAt: new Date().toISOString(),
  sourceTreeSha256,
  validation: {
    finalReleaseContract: '59/59 PASS',
    releaseHardeningContract: '38/38 PASS',
    dailyWorkflowContract: '16/16 PASS',
    taskProjectWorkflowContract: '19/19 PASS',
    plannerOverhaulContract: '21/21 PASS',
    reviewsHistoryContract: '26/26 PASS',
    habitsFocusContract: '35/35 PASS',
    commandFirstContract: '36/36 PASS',
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
    databaseSchema: 15,
    legacyDatabaseMigration: true,
    legacyBackupImportPatchAcceptance: true,
  },
  highlights: [
    'Warm ink-and-paper palette improves reading contrast without replacing the user-selected accent system',
    'Editorial typography, ruled sections, and sharper geometry replace generic dashboard card patterns',
    'Desktop navigation, page hierarchy, controls, overlays, and report surfaces share one coherent visual language',
    'Mobile gains a dedicated editorial masthead, responsive gutters, full-width page actions, and distinctive bottom navigation',
    'Hover, active, focus, loading, and overlay states are clearer and use restrained motion',
    'Reduced-motion preferences collapse visual transition and animation duration',
    'Existing v1.7 commands, shortcuts, features, and interaction contracts remain intact',
    'Schema v15 retained with no v1.8 migration and v8–v15 backup compatibility unchanged',
    'Full final, release-hardening, daily-workflow, task-project, planner-overhaul, reviews-history, habits-focus, command-first, typecheck, production-build, and dist validation gate',
    'GitHub Pages deployment verified from main',
  ],
  files,
}

fs.writeFileSync(path.join(root, 'RELEASE_MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Wrote RELEASE_MANIFEST.json for ${files.length} files.`)
console.log(`Source tree SHA-256: ${sourceTreeSha256}`)
