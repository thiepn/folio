import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const dist = path.join(root, 'dist')
const manifestPath = path.join(dist, 'release-manifest.json')

if (!fs.existsSync(dist)) throw new Error('dist/ does not exist. Build Folio before generating the release manifest.')

const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const pkg = JSON.parse(read('package.json'))
const database = read('src/db/database.ts')
const schemaMatch = database.match(/DATABASE_SCHEMA_VERSION\s*=\s*(\d+)\b/)
if (!schemaMatch) throw new Error('Could not determine the current IndexedDB schema version.')
const databaseSchema = Number(schemaMatch[1])

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    return [full]
  })
}

const files = walk(dist)
  .filter((file) => path.resolve(file) !== path.resolve(manifestPath))
  .map((file) => {
    const bytes = fs.readFileSync(file)
    return {
      path: path.relative(dist, file).replaceAll('\\', '/'),
      bytes: bytes.length,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    }
  })
  .sort((a, b) => a.path.localeCompare(b.path))

const artifactSha256 = crypto.createHash('sha256')
  .update(files.map((file) => file.path + ':' + file.bytes + ':' + file.sha256).join('\n'))
  .digest('hex')
const sourceCommit = /^[0-9a-f]{40}$/i.test(process.env.GITHUB_SHA || '') ? process.env.GITHUB_SHA : null

const manifest = {
  product: 'Folio',
  repository: 'thiepn/folio',
  version: pkg.version,
  databaseSchema,
  releaseType: 'production-hardening-d20',
  generatedAt: new Date().toISOString(),
  sourceCommit,
  releaseGate: 'npm run release:verify',
  artifact: {
    fileCount: files.length,
    bytes: files.reduce((sum, file) => sum + file.bytes, 0),
    sha256: artifactSha256,
  },
  deployment: {
    pagesUrl: 'https://thiepn.dev/folio/',
    ciWorkflow: '.github/workflows/ci.yml',
    pagesWorkflow: '.github/workflows/deploy-pages.yml',
  },
  guarantees: [
    'Dependency installation is lockfile-driven with npm ci.',
    'The deployment artifact passed source validators, typecheck, production build, and dist validation.',
    'Every built file represented by this manifest is byte-counted and SHA-256 hashed.',
    'The manifest schema version is derived from the current database source instead of duplicated by hand.',
  ],
  files,
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
console.log('Wrote dist/release-manifest.json for ' + files.length + ' artifact files.')
console.log('Artifact SHA-256: ' + artifactSha256)
