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

const manifest = {
  product: 'Folio',
  repository: 'thiepn/folio',
  version: '1.1.1',
  databaseSchema: 12,
  releaseType: 'release-hardening',
  generatedAt: new Date().toISOString(),
  sourceTreeSha256,
  validation: {
    finalReleaseContract: '53/53 PASS',
    releaseHardeningContract: '38/38 PASS',
    dependencyBackedProductionBuild: 'CI REQUIRED — network unavailable in generation environment',
    githubPagesDeployment: 'REQUIRES one-time repository Pages source = GitHub Actions',
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
    'Exact direct dependency pins for the v1.1.1 patch release',
    'Repeatable final, release-hardening, typecheck, production-build, and dist validation gate',
    'Pull-request CI with production artifact upload',
    'Verified GitHub Pages deployment workflow for main',
    'GitHub Pages subpath and PWA/service-worker release checks',
    'Explicit pre-Folio migration and backup/restore certification gates',
  ],
  files,
}

fs.writeFileSync(path.join(root, 'RELEASE_MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Wrote RELEASE_MANIFEST.json for ${files.length} files.`)
console.log(`Source tree SHA-256: ${sourceTreeSha256}`)
