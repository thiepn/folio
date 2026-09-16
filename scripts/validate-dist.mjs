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

check('dist directory exists', exists('.'))
for (const file of ['index.html', '.nojekyll', 'manifest.webmanifest', 'offline.html', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png']) {
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
  check('service worker uses Folio cache namespace', sw.includes('folio-app-') && sw.includes('folio-runtime-v1'))
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

if (failed) process.exit(1)
