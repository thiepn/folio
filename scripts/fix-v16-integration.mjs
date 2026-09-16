import fs from 'node:fs'

const file = 'scripts/apply-v16-integration.mjs'
let text = fs.readFileSync(file, 'utf8')
const start = text.indexOf('// Focus reflection becomes searchable history.')
const end = text.indexOf('// App wiring.')
if (start < 0 || end < 0 || end <= start) throw new Error('Could not locate history integration block.')
const block = `// Focus reflection becomes searchable history.\n{\n  const file = 'src/features/review/historyLogic.ts'\n  let text = read(file)\n  text = replaceOne(text,\n    \`      projectId: session.projectIdSnapshot,\\n    }))\`,\n    \`      projectId: session.projectIdSnapshot,\\n      extraSearch: [session.intention, session.note].filter(Boolean).join(' '),\\n    }))\`,\n    'focus history context')\n  write(file, text)\n}\n\n`
text = text.slice(0, start) + block + text.slice(end)
fs.writeFileSync(file, text)
console.log('Updated v1.6 history integration for the v1.5 searchable-history shape.')
