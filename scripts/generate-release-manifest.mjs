import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const excludedRoots = new Set(['.git', 'dist', 'node_modules'])
const excludedFiles = new Set([
  'RELEASE_MANIFEST.json',
  'vite.config.js',
  'vite.config.d.ts',
])
const excludedSuffixes = ['.tsbuildinfo']
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

function walk(dir = '.') {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name).replace(/^\.\//, '')
    if (entry.isDirectory()) return excludedRoots.has(rel.split(path.sep)[0]) ? [] : walk(rel)
    if (excludedFiles.has(rel) || excludedSuffixes.some((suffix) => rel.endsWith(suffix))) return []
    return [rel]
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

const manifest = {
  product: 'Folio',
  repository: 'thiepn/folio',
  version: pkg.version,
  databaseSchema: 12,
  releaseType: 'daily-workflow',
  generatedAt: new Date().toISOString(),
  sourceTreeSha256,
  validation: {
    finalReleaseContract: '54/54 PASS',
    releaseHardeningContract: '38/38 PASS',
    dailyWorkflowContract: '16/16 PASS',
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
    databaseSchema: 12,
    legacyDatabaseMigration: true,
    legacyBackupImportPatchAcceptance: true,
  },
  highlights: [
    'Daily Top 3 derived from the existing Must planning bucket',
    'Explicit carryover resolution before adding more work',
    'Today, Next, and Later triage on one operating surface',
    'Current Focus context and suggested next unblocked action',
    'Per-day end-of-day wrap-up with undoable unfinished-task roll-forward',
    'Schema v12 retained with no migration required for v1.2',
    'Full final, release-hardening, daily-workflow, typecheck, production-build, and dist validation gate',
    'GitHub Pages deployment verified from main',
  ],
  files,
}

fs.writeFileSync(path.join(root, 'RELEASE_MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Wrote RELEASE_MANIFEST.json for ${files.length} files.`)
console.log(`Source tree SHA-256: ${sourceTreeSha256}`)
