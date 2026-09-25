import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const dist = path.join(root, 'dist')
let failed = false
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed = true
}
const read = (p) => fs.readFileSync(path.join(dist, p), 'utf8')
const exists = (p) => fs.existsSync(path.join(dist, p))
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex')
function walkFiles(dir = dist) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return walkFiles(full)
    return [path.relative(dist, full).replaceAll('\\', '/')]
  })
}

check('dist directory exists', exists('.'))
for (const file of ['index.html', '.nojekyll', 'manifest.webmanifest', 'offline.html', 'sw.js', 'release-manifest.json', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png']) {
  check(`dist contains ${file}`, exists(file))
}

if (exists('index.html')) {
  const html = read('index.html')
  check('built HTML title is Folio', html.includes('<title>Folio — Personal Planner</title>'))
  check('built HTML has no root-relative Vite assets', !/(?:src|href)=["']\/(?:assets|manifest\.webmanifest|icons\/)/.test(html))
  const refs = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map((m) => m[1])
    .filter((ref) => !/^(?:https?:|data:|#)/.test(ref))
  for (const ref of refs) {
    const clean = ref.replace(/^\.\//, '').split(/[?#]/)[0]
    if (clean) check(`built reference resolves: ${ref}`, exists(clean), clean)
  }
}

if (exists('manifest.webmanifest')) {
  const manifest = JSON.parse(read('manifest.webmanifest'))
  check('built manifest start URL is relative', manifest.start_url === './', manifest.start_url)
  check('built manifest scope is relative', manifest.scope === './', manifest.scope)
}

if (exists('sw.js')) {
  const sw = read('sw.js')
  check('service worker precaches app shell', sw.includes("'./index.html'") || sw.includes('"./index.html"'))
  check('service worker uses revision-scoped Folio caches', sw.includes('folio-app-') && sw.includes('folio-runtime-'))
  check('service worker cache writes cannot fail network responses', sw.includes('cachePutSafely'))
  check('service worker retains legacy cache cleanup', sw.includes('obsidian-editorial-app-'))
}

function pngDimensions(file) {
  const b = fs.readFileSync(path.join(dist, file))
  if (b.length < 24 || b.toString('ascii', 1, 4) !== 'PNG') return null
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
}
for (const [file, expected] of [['icons/icon-192.png', 192], ['icons/icon-512.png', 512], ['icons/icon-maskable-512.png', 512]]) {
  if (!exists(file)) continue
  const d = pngDimensions(file)
  check(`${file} dimensions are ${expected}×${expected}`, d?.width === expected && d?.height === expected, d ? `${d.width}×${d.height}` : 'invalid PNG')
}

if (fs.existsSync(dist)) {
  const maps = []
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (entry.name.endsWith('.map')) maps.push(path.relative(dist, full))
  })
  walk(dist)
  check('production artifact contains no source maps', maps.length === 0, maps.join(', '))
}


if (exists('release-manifest.json')) {
  try {
    const release = JSON.parse(read('release-manifest.json'))
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
    const database = fs.readFileSync(path.join(root, 'src/db/database.ts'), 'utf8')
    const schemaMatch = database.match(/DATABASE_SCHEMA_VERSION\s*=\s*(\d+)\b/)
    const schema = schemaMatch ? Number(schemaMatch[1]) : null
    check('release manifest identifies Folio repository', release.product === 'Folio' && release.repository === 'thiepn/folio')
    check('release manifest version matches package', release.version === pkg.version, release.version)
    check('release manifest schema matches source', release.databaseSchema === schema, String(release.databaseSchema))
    check('release manifest marks D20 production hardening', release.releaseType === 'production-hardening-d20', release.releaseType)
    check('release manifest records the release gate', release.releaseGate === 'npm run release:verify', release.releaseGate)
    if (process.env.GITHUB_SHA) check('release manifest records CI source commit', release.sourceCommit === process.env.GITHUB_SHA, release.sourceCommit || 'null')
    else check('local release manifest source commit is nullable', release.sourceCommit == null || /^[0-9a-f]{40}$/i.test(release.sourceCommit), release.sourceCommit || 'null')

    const manifestFiles = Array.isArray(release.files) ? release.files : []
    const represented = []
    let representedBytes = 0
    for (const file of manifestFiles) {
      const safePath = typeof file?.path === 'string' && file.path.length > 0 && !path.isAbsolute(file.path) && !file.path.split('/').includes('..')
      check('manifest path is safe: ' + (file?.path || '<missing>'), safePath)
      if (!safePath) continue
      represented.push(file.path)
      const target = path.join(dist, file.path)
      const present = fs.existsSync(target) && fs.statSync(target).isFile()
      check('manifest file exists: ' + file.path, present)
      if (!present) continue
      const bytes = fs.readFileSync(target)
      representedBytes += bytes.length
      check('manifest byte count matches: ' + file.path, file.bytes === bytes.length, String(file.bytes) + '/' + bytes.length)
      check('manifest SHA-256 matches: ' + file.path, file.sha256 === sha256(bytes))
    }

    const actualRepresented = walkFiles().filter((file) => file !== 'release-manifest.json').sort()
    const declaredRepresented = [...represented].sort()
    check('manifest file set matches dist', JSON.stringify(declaredRepresented) === JSON.stringify(actualRepresented), declaredRepresented.length + '/' + actualRepresented.length)
    check('manifest file count matches', release.artifact?.fileCount === actualRepresented.length, String(release.artifact?.fileCount) + '/' + actualRepresented.length)
    check('manifest byte total matches', release.artifact?.bytes === representedBytes, String(release.artifact?.bytes) + '/' + representedBytes)
    const aggregate = sha256(Buffer.from(manifestFiles.map((file) => file.path + ':' + file.bytes + ':' + file.sha256).join('\n')))
    check('artifact SHA-256 matches manifest', release.artifact?.sha256 === aggregate, release.artifact?.sha256)
  } catch (error) {
    check('release manifest parses and verifies', false, error instanceof Error ? error.message : String(error))
  }
}

if (failed) process.exit(1)
