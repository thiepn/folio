import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const exists = (p) => fs.existsSync(path.join(root, p))
const checks = []
const check = (name, ok) => checks.push({ name, ok: Boolean(ok) })
const sameRecord = (a = {}, b = {}) => {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])]
  return keys.every((key) => a[key] === b[key])
}
const ACTIONS = {
  checkout: 'd23441a48e516b6c34aea4fa41551a30e30af803',
  setupNode: '820762786026740c76f36085b0efc47a31fe5020',
  uploadArtifact: 'ea165f8d65b6e75b540449e92b4886f43607fa02',
  configurePages: '45bfe0192ca1faeb007ade9deae92b16b8254a0d',
  uploadPagesArtifact: '7b1f4a764d45c48632c6b24a0339c27f5614fb0b',
  deployPages: '368f82528645a54fb793d4d04e342629a3f51346',
}

const pkg = JSON.parse(read('package.json'))
const lock = JSON.parse(read('package-lock.json'))
const lockRoot = lock.packages?.[''] || {}
check('D20 validator registered', pkg.scripts?.['validate:d20'] === 'node scripts/validate-production-hardening-d20.mjs')
check('release gate runs D20 before build', pkg.scripts?.['release:verify']?.includes('validate:d20') && pkg.scripts['release:verify'].indexOf('validate:d20') < pkg.scripts['release:verify'].indexOf('npm run build'))
check('build emits release manifest', pkg.scripts?.build?.includes('npm run manifest:release'))
check('lockfile v3 committed', lock.lockfileVersion === 3)
check('lockfile root version matches', lockRoot.name === pkg.name && lockRoot.version === pkg.version)
check('lockfile dependencies match', sameRecord(lockRoot.dependencies, pkg.dependencies))
check('lockfile devDependencies match', sameRecord(lockRoot.devDependencies, pkg.devDependencies))

const ci = read('.github/workflows/ci.yml')
const pages = read('.github/workflows/deploy-pages.yml')
for (const [name, workflow] of [['CI', ci], ['Pages', pages]]) {
  check(name + ' uses npm ci', workflow.includes('npm ci --ignore-scripts --no-audit --no-fund') && !workflow.includes('npm install '))
  check(name + ' checkout drops credentials', workflow.includes('persist-credentials: false'))
  check(name + ' pins checkout', workflow.includes('actions/checkout@' + ACTIONS.checkout))
  check(name + ' pins setup-node', workflow.includes('actions/setup-node@' + ACTIONS.setupNode))
}
check('CI pins upload-artifact', ci.includes('actions/upload-artifact@' + ACTIONS.uploadArtifact))
check('Pages pins configure-pages', pages.includes('actions/configure-pages@' + ACTIONS.configurePages))
check('Pages pins upload-pages-artifact', pages.includes('actions/upload-pages-artifact@' + ACTIONS.uploadPagesArtifact))
check('Pages pins deploy-pages', pages.includes('actions/deploy-pages@' + ACTIONS.deployPages))
check('Pages defaults to contents read', /permissions:\s*\n\s+contents:\s+read/.test(pages))
check('Pages write permission isolated to deploy', /deploy:[\s\S]*?permissions:\s*\n\s+pages:\s+write\s*\n\s+id-token:\s+write/.test(pages))

const vite = read('vite.config.ts')
check('runtime cache revision scoped', vite.includes("const RUNTIME_CACHE = 'folio-runtime-' + REVISION"))
check('old runtime caches removed', vite.includes("key.startsWith('folio-runtime-') && key !== RUNTIME_CACHE"))
check('cache writes are best effort', vite.includes('async function cachePutSafely') && vite.includes('Cache quota or browser policy must not break a successful network response.'))
check('partial responses are not runtime cached', vite.includes('response.ok && response.status === 200'))

const database = read('src/services/databaseService.ts')
check('startup maintenance is recoverable', database.includes('runRecoverableStartupStep') && database.includes("reportRuntimeIssue('recovery'"))
check('database opens before maintenance', database.indexOf('await db.open()') >= 0 && database.indexOf('await db.open()') < database.indexOf('const maintenanceSteps'))
for (const label of ['Recurring task materialization','Focus session reconciliation','Storage safety initialization','Attachment orphan cleanup','Search index rebuild','Daily automation']) {
  check('startup includes ' + label, database.includes(label))
}

const recovery = read('src/components/layout/FatalRecoveryState.tsx')
check('reset copy says empty Folio workspace', recovery.includes('recreate an empty Folio workspace') && !recovery.includes('prototype workspace'))

const generator = read('scripts/generate-release-manifest.mjs')
const distValidator = read('scripts/validate-dist.mjs')
check('manifest generated into dist only', generator.includes("path.join(dist, 'release-manifest.json')") && !exists('RELEASE_MANIFEST.json'))
check('manifest schema derived from database source', generator.includes("read('src/db/database.ts')") && generator.includes('Could not determine the current IndexedDB schema version.'))
check('manifest hashes artifact', generator.includes("crypto.createHash('sha256')") && generator.includes('artifactSha256'))
check('dist verifies manifest', distValidator.includes('release-manifest.json') && distValidator.includes('artifact SHA-256 matches manifest') && distValidator.includes('manifest file set matches dist'))

const readme = read('README.md')
check('README identifies schema v24', readme.includes('IndexedDB schema:') && readme.includes('current database schema is **v24**'))
check('README documents D20', readme.includes('D20') && readme.includes('Production Hardening'))
check('D20 document exists', exists('docs/PRODUCTION_HARDENING_D20.md'))

const dbSource = read('src/db/database.ts')
check('D20 leaves schema v24', /DATABASE_SCHEMA_VERSION\s*=\s*24\b/.test(dbSource) && !dbSource.includes('this.version(25)'))

const failures = checks.filter((item) => !item.ok)
for (const item of checks) console.log((item.ok ? 'PASS' : 'FAIL') + '  ' + item.name)
console.log('\n' + (checks.length - failures.length) + '/' + checks.length + ' D20 production-hardening checks passed.')
if (failures.length) process.exit(1)
