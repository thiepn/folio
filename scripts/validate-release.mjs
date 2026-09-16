import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const failures = []
const passes = []
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const exists = (p) => fs.existsSync(path.join(root, p))
const check = (name, ok, detail = '') => {
  const row = { name, ok: Boolean(ok), detail }
  ;(row.ok ? passes : failures).push(row)
  console.log(`${row.ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const pkg = JSON.parse(read('package.json'))
check('release version is 1.4.0', pkg.version === '1.4.0', pkg.version)
check('GitHub Pages homepage configured', pkg.homepage === 'https://thiepn.github.io/folio/', pkg.homepage)
check('release verification script registered', pkg.scripts?.['release:verify']?.includes('validate:dist'))

for (const [group, deps] of Object.entries({ dependencies: pkg.dependencies, devDependencies: pkg.devDependencies })) {
  for (const [name, version] of Object.entries(deps ?? {})) {
    check(`${group} ${name} is directly pinned`, /^\d+\.\d+\.\d+(?:[-+].+)?$/.test(version), version)
  }
}

const ci = read('.github/workflows/ci.yml')
check('CI runs release verification', ci.includes('npm run release:verify'))
check('CI has bounded timeout', /timeout-minutes:\s*12/.test(ci))
check('CI uploads build artifact', ci.includes('actions/upload-artifact@v4'))

const pages = read('.github/workflows/deploy-pages.yml')
check('Pages deploys only from main push/manual run', pages.includes('branches: [main]') && pages.includes('workflow_dispatch:'))
check('Pages permissions are least-required', pages.includes('contents: read') && pages.includes('pages: write') && pages.includes('id-token: write'))
check('Pages build verifies release first', pages.includes('npm run release:verify'))
check('Pages uses configure-pages v6', pages.includes('actions/configure-pages@v6'))
check('Pages uploads dist only', /path:\s*dist\b/.test(pages))
check('Pages uses upload-pages-artifact v4', pages.includes('actions/upload-pages-artifact@v4'))
check('Pages uses deploy-pages v5', pages.includes('actions/deploy-pages@v5'))
check('Pages deployment environment declared', pages.includes('name: github-pages'))

check('.nojekyll source exists', exists('public/.nojekyll'))
const vite = read('vite.config.ts')
check('Vite is GitHub Pages subpath-safe', /base:\s*['"]\.\/['"]/.test(vite))
check('service worker URL is BASE_URL aware', read('src/services/pwaService.ts').includes('import.meta.env.BASE_URL'))

const legacy = read('src/legacy/compat.ts')
const dbService = read('src/services/databaseService.ts')
const schemas = read('src/domain/schemas.ts')
const importSchema = read('src/features/import/importSchema.ts')
const patchSchema = read('src/features/patch/patchSchema.ts')
check('legacy DB name retained only for migration', legacy.includes("LEGACY_DATABASE_NAME = 'obsidian-editorial-productivity'") && dbService.includes('migrateLegacyDatabaseName'))
check('legacy database is deleted only after count verification', dbService.includes('expected.some') && dbService.indexOf('Dexie.delete(LEGACY_DATABASE_NAME)') > dbService.indexOf('expected.some'))
check('legacy backup payload remains accepted', schemas.includes('LEGACY_BACKUP_FORMAT'))
check('legacy import payload remains accepted', importSchema.includes('LEGACY_IMPORT_FORMAT'))
check('legacy patch payload remains accepted', patchSchema.includes('LEGACY_PATCH_FORMAT'))

const manifest = JSON.parse(read('public/manifest.webmanifest'))
check('PWA start URL remains relative', manifest.start_url === './', manifest.start_url)
check('PWA scope remains relative', manifest.scope === './', manifest.scope)
check('PWA id remains relative', manifest.id === './', manifest.id)

const releaseDoc = read('docs/RELEASE_HARDENING_V1_1_1.md')
check('release doc contains backup/restore gate', /backup[\s\S]*restore/i.test(releaseDoc))
check('release doc contains migration gate', /legacy.*migration|migration.*legacy/i.test(releaseDoc))
check('release doc documents Pages one-time setup', releaseDoc.includes('Settings → Pages'))

console.log(`\n${passes.length}/${passes.length + failures.length} release-hardening checks passed.`)
if (failures.length) process.exit(1)
