import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const root = process.cwd()
const checks = []
const check = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail })
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const exists = (p) => fs.existsSync(path.join(root, p))
const hasTrackedFiles = (pathspec) => {
  try {
    return execFileSync('git', ['ls-files', pathspec], { cwd: root, encoding: 'utf8' }).trim().length > 0
  } catch {
    // Release archives do not necessarily contain .git; in that case fall back
    // to checking whether the generated/dependency directory was shipped at all.
    return exists(pathspec)
  }
}

const pkg = JSON.parse(read('package.json'))
check('stable package version', pkg.version === '1.5.0', pkg.version)
check('package renamed to Folio', pkg.name === 'folio', pkg.name)
check('repository points to thiepn/folio', pkg.repository?.url === 'https://github.com/thiepn/folio.git', pkg.repository?.url)
check('final validator registered', pkg.scripts?.['validate:final'] === 'node scripts/validate-final.mjs')

const database = read('src/db/database.ts')
check('database schema v14', /DATABASE_SCHEMA_VERSION\s*=\s*14\b/.test(database))
check('v13→v14 migration registered', database.includes('migrateV13ToV14'))

const backup = read('src/services/backupService.ts')
check('restore floor remains v8', /MIN_RESTORABLE_BACKUP_VERSION\s*=\s*8\b/.test(backup))
check('restore ceiling follows current schema', backup.includes('raw.version > DATABASE_SCHEMA_VERSION'))
check('backup export follows current schema', backup.includes('version: DATABASE_SCHEMA_VERSION'))
check('backup validates dependency cycles', backup.includes('Backup contains a task dependency cycle.'))

const interop = read('src/features/interop/InteroperabilityModal.tsx')
check('visible backup copy says v14', interop.includes('Schema v14 · complete planner state'))
check('visible restore range says v8–v14', interop.includes('schema v8–v14'))
check('runtime UI has no stale backup schema copy', !/Schema v1[1-3] · complete planner state|schema v8–v1[1-3]/.test(interop))

check('public v14 backup schema exists', exists('public/schema/folio-backup-v14.schema.json'))
for (const p of [
  'public/schema/folio-import-v1.schema.json',
  'public/schema/folio-patch-v1.schema.json',
  'public/schema/folio-backup-v14.schema.json',
  'public/schema/folio-selection-v1.schema.json',
  'public/manifest.webmanifest',
]) {
  try { JSON.parse(read(p)); check(`${p} parses`, true) }
  catch (e) { check(`${p} parses`, false, e.message) }
}

const manifest = JSON.parse(read('public/manifest.webmanifest'))
check('manifest relative start URL', typeof manifest.start_url === 'string' && !manifest.start_url.startsWith('/'), manifest.start_url)
check('manifest relative scope', typeof manifest.scope === 'string' && !manifest.scope.startsWith('/'), manifest.scope)
check('manifest standalone display', manifest.display === 'standalone')
check('manifest uses Folio identity', manifest.name === 'Folio — Personal Planner' && manifest.short_name === 'Folio')

const vite = read('vite.config.ts')
check('Vite base remains relative', /base:\s*['"]\.\/['"]/.test(vite))
check('production service worker emitted', vite.includes("fileName: 'sw.js'"))
check('service worker update remains message-gated', vite.includes("SKIP_WAITING"))

const styleIndex = read('src/styles/index.css')
check('polish stylesheet loaded', styleIndex.includes("@import './polish.css';"))
check('accessibility stylesheet final', styleIndex.lastIndexOf("@import './accessibility.css';") > styleIndex.lastIndexOf("@import './polish.css';"))

const tokens = read('src/styles/tokens.css')
const settingsRepo = read('src/repositories/settingsRepository.ts')
check('cool-blue fresh accent present', settingsRepo.includes("accent: '#4169FF'"))
check('editorial font token present', tokens.includes('--font-editorial:'))
check('quiet control radius present', tokens.includes('--radius-control:'))
check('fresh installs initialize blank', read('src/db/seed.ts').includes('export async function installDemoWorkspace()'))
check('global workspace search enabled', read('src/features/power/CommandPalette.tsx').includes('searchOnly?: boolean'))
check('navigation continuity enabled', read('src/app/App.tsx').includes('folio:last-view:v1'))
check('contextual topbar enabled', read('src/components/layout/Topbar.tsx').includes('topbar__context'))

const accessibility = read('src/styles/accessibility.css')
check('reduced motion retained', accessibility.includes('prefers-reduced-motion'))
check('forced colors retained', accessibility.includes('forced-colors'))

const index = read('index.html')
check('viewport does not disable zoom', !/user-scalable\s*=\s*no/i.test(index) && !/maximum-scale\s*=\s*1(?:\.0+)?/i.test(index))
check('manifest linked', /rel=["']manifest["']/.test(index))
check('HTML metadata uses Folio identity', index.includes('application-name" content="Folio"') && index.includes('<title>Folio — Personal Planner</title>'))

function walk(dir) {
  const abs = path.join(root, dir)
  if (!fs.existsSync(abs)) return []
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((ent) => {
    const rel = path.join(dir, ent.name)
    if (ent.isDirectory()) return walk(rel)
    return [rel]
  })
}

const source = walk('src').filter((p) => /\.(ts|tsx|js|jsx)$/.test(p))
const userFacingBrandFiles = [...walk('src'), ...walk('public'), ...walk('docs')].filter((p) => !p.endsWith('src/legacy/compat.ts'))
const staleBrand = userFacingBrandFiles.filter((p) => {
  if (!exists(p)) return false
  try { return /Obsidian Editorial|obsidian-editorial/i.test(read(p)) } catch { return false }
})
check('retired brand absent from user-facing product files', staleBrand.length === 0, staleBrand.slice(0, 5).join(', '))
const unresolved = []
for (const file of source) {
  const text = read(file)
  const dir = path.dirname(file)
  for (const m of text.matchAll(/(?:from\s+|import\s*)['"](\.[^'"]+)['"]/g)) {
    const spec = m[1]
    const base = path.normalize(path.join(dir, spec))
    const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]
    if (!candidates.some((p) => exists(p))) unresolved.push(`${file}: ${spec}`)
  }
}
check('all relative source imports resolve', unresolved.length === 0, unresolved.slice(0, 5).join('; '))

const uiRoots = ['src/app','src/components','src/features','src/hooks','src/adapters']
const dbViolations = uiRoots.flatMap(walk).filter((p) => /\.(ts|tsx|js|jsx)$/.test(p)).filter((file) => {
  const text = read(file)
  return /from\s+['"][^'"]*(?:db\/database|db\.database)[^'"]*['"]/.test(text) || /indexedDB\.(?:open|deleteDatabase)\s*\(/.test(text)
})
check('UI/features do not access IndexedDB directly', dbViolations.length === 0, dbViolations.join(', '))

check('no retained dist build', !hasTrackedFiles('dist'))
check('no retained node_modules', !hasTrackedFiles('node_modules'))

for (const css of walk('src/styles').filter((p) => p.endsWith('.css'))) {
  const text = read(css)
  const opens = (text.match(/{/g) || []).length
  const closes = (text.match(/}/g) || []).length
  check(`${css} brace balance`, opens === closes, `${opens}/${closes}`)
}

const failures = checks.filter((c) => !c.ok)
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? ` — ${c.detail}` : ''}`)
console.log(`\n${checks.length - failures.length}/${checks.length} final checks passed.`)
if (failures.length) process.exit(1)
