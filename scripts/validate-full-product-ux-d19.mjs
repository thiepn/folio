import fs from 'node:fs'
import path from 'node:path'

const root=process.cwd()
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8')
const exists=(p)=>fs.existsSync(path.join(root,p))
const checks=[]
const check=(name,ok)=>checks.push({name,ok:Boolean(ok)})

const pkg=JSON.parse(read('package.json'))
const database=read('src/db/database.ts')
const sidebar=read('src/components/layout/Sidebar.tsx')
const mobileMore=read('src/components/layout/MobileMoreSheet.tsx')
const mobileNav=read('src/components/layout/MobileNav.tsx')
const topbar=read('src/components/layout/Topbar.tsx')
const tabs=read('src/components/ui/Tabs.tsx')
const search=read('src/features/search/SearchView.tsx')
const inbox=read('src/features/inbox/InboxView.tsx')
const app=read('src/app/App.tsx')
const shortcuts=read('src/features/power/shortcuts.ts')
const styles=read('src/styles/ux-audit-d19.css')
const styleIndex=read('src/styles/index.css')

check('D19 validator registered',pkg.scripts?.['validate:d19']==='node scripts/validate-full-product-ux-d19.mjs')
check('release gate runs D19',pkg.scripts?.['release:verify']?.includes('validate:d19'))
check('D19 does not change data schema',/DATABASE_SCHEMA_VERSION\s*=\s*24\b/.test(database)&&!database.includes('this.version(25)'))

check('desktop navigation is grouped by intent',sidebar.includes("label: 'Daily'")&&sidebar.includes("label: 'Workspace'")&&sidebar.includes("label: 'Review'")&&sidebar.includes("label: 'Tools'"))
check('desktop navigation groups expose accessible labels',sidebar.includes('role="group"')&&sidebar.includes('aria-label={group.label}'))
check('empty Favorites section is removed on fresh workspaces',sidebar.includes('const hasFavorites')&&sidebar.includes('{hasFavorites ? <section')&&!sidebar.includes('Favorite a list, project, or tag—or pin a Smart View.'))
check('sidebar local-first status acknowledges optional sync',sidebar.includes('Local-first · sync optional'))
check('desktop nav owns short-height overflow',styles.includes('.sidebar-nav {')&&styles.includes('overflow-y: auto')&&styles.includes('min-height: 0'))

check('mobile More is grouped by user intent',mobileMore.includes("label: 'Workspace'")&&mobileMore.includes("label: 'Plan & review'")&&mobileMore.includes("label: 'Connect'"))
check('mobile More groups are labeled sections',mobileMore.includes('mobile-more-group')&&mobileMore.includes('aria-label={group.label}'))
check('mobile primary navigation remains stable',mobileNav.includes("view: 'today'")&&mobileNav.includes("view: 'inbox'")&&mobileNav.includes("active === 'planner'"))

check('generic view switcher uses button-group semantics',tabs.includes('role="group"')&&tabs.includes('aria-pressed={value === tab.value}'))
check('generic view switcher no longer claims tabpanel semantics',!tabs.includes('role="tablist"')&&!tabs.includes('role="tab"')&&!tabs.includes('aria-selected'))

check('mobile PageHeader actions remain visible',styles.includes('@media (max-width: 560px)')&&styles.includes('.page-header__action')&&styles.includes('display: block'))
check('mobile header actions wrap rather than disappear',styles.includes('.page-header__action .header-actions')&&styles.includes('flex: 1 1 auto'))

check('topbar command hint uses configured shortcut',topbar.includes('searchShortcut: string')&&topbar.includes('{searchShortcut} · /')&&app.includes('searchShortcut={formatShortcut(shortcuts.palette)}'))
check('shortcut formatter remains platform-aware',shortcuts.includes('export function formatShortcut')&&shortcuts.includes("part === 'mod'"))

check('Search clears stale errors on a new request',search.includes("setSearching(true)\n    setError('')"))
check('Search arrow navigation requires results',search.includes("event.key==='ArrowDown'&&results.length")&&search.includes("event.key==='ArrowUp'&&results.length"))
check('Search selection is clamped after result changes',search.includes('if(activeIndex>=results.length)setActiveIndex(results.length-1)'))
check('Search keyboard selection scrolls into view',search.includes("scrollIntoView({block:'nearest'})"))
check('Search result buttons keep native actionable semantics',!search.includes('role="listbox"')&&!search.includes('role="option"')&&search.includes("aria-current={index===activeIndex?'true':undefined}"))
check('Search result count announces changes',search.includes('aria-live="polite"'))

check('Inbox fixed keys ignore modified browser shortcuts',inbox.includes('event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey'))
check('global next previous shortcuts yield to Inbox triage',app.includes("view !== 'inbox' && matchesShortcut(event, shortcuts.nextTask)")&&app.includes("view !== 'inbox' && matchesShortcut(event, shortcuts.previousTask)"))

check('URL can identify the current top-level workspace',app.includes('function viewFromUrl()')&&app.includes("searchParams.get('view')"))
check('initial navigation history entry is normalized',app.includes("url.searchParams.has('view')")&&app.includes('window.history.replaceState({ folioView: view }'))
check('workspace navigation pushes browser history',app.includes("window.history.pushState({ folioView: next }"))
check('browser Back Forward restores workspace',app.includes("addEventListener('popstate'")&&app.includes("const next = viewFromUrl() ?? 'today'"))
check('history navigation preserves focus orientation',app.includes("mainRef.current?.focus({ preventScroll: true })"))

check('D19 correction stylesheet loads last',styleIndex.trim().endsWith("@import './ux-audit-d19.css';")&&styles.includes('D19 — Full-Product UX Audit corrections'))
check('D19 audit report exists',exists('docs/FULL_PRODUCT_UX_AUDIT_D19.md'))

const failures=checks.filter((item)=>!item.ok)
for(const item of checks)console.log(`${item.ok?'PASS':'FAIL'}  ${item.name}`)
console.log(`\n${checks.length-failures.length}/${checks.length} D19 checks passed.`)
if(failures.length)process.exit(1)
