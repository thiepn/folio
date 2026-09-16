import fs from 'node:fs'

const file = 'scripts/apply-v15-integration.mjs'
let text = fs.readFileSync(file, 'utf8')
const oldTop = "  text = replaceOne(text, `databaseSchema: 13,`, `databaseSchema: 14,`, 'manifest schema')"
const newTop = "  text = replaceOne(text, `  version: pkg.version,\\n  databaseSchema: 13,`, `  version: pkg.version,\\n  databaseSchema: 14,`, 'manifest schema')"
const oldCompat = "  text = replaceOne(text, `    databaseSchema: 13,`, `    databaseSchema: 14,`, 'manifest compatibility schema')"
if (!text.includes(oldTop) || !text.includes(oldCompat)) throw new Error('v1.5 manifest patch anchors changed unexpectedly')
text = text.replace(oldTop, newTop)
fs.writeFileSync(file, text)
console.log('Made v1.5 manifest integration anchors context-specific.')
