import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'
import type { ProjectSummary } from '../../repositories/projectRepository'
import type { TagEntity, SearchOwnerType } from '../../domain/models'
import {
  contentSearchService, parseSearchQuery,
  type ContentSearchHit, type SearchFilters, type SearchSort, type SearchStatusFilter,
} from '../../services/contentSearchService'
import { searchPreferencesService } from '../../services/searchPreferencesService'

const TYPES: Array<{value:SearchOwnerType;label:string}>=[
  {value:'task',label:'Tasks'},{value:'note',label:'Notes'},{value:'project',label:'Projects'},
  {value:'habit',label:'Habits'},{value:'review',label:'Reviews'},{value:'tag',label:'Tags'},
]

function defaultFilters():SearchFilters{return {types:[],status:'all',includeArchived:false,sort:'relevance'}}

function hasFilters(filters:SearchFilters){
  return Boolean(filters.types?.length||filters.projectId||filters.tagId||(filters.status&&filters.status!=='all')||filters.includeArchived||filters.updatedWithinDays||filters.dateFrom||filters.dateTo||(filters.sort&&filters.sort!=='relevance'))
}

function escapeRegex(value:string){return value.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&')}

function Highlighted({text,query}:{text:string;query:string}){
  const terms=parseSearchQuery(query).terms.map((term)=>term.trim()).filter((term)=>term.length>=2)
  if(!terms.length)return <>{text}</>
  const pattern=new RegExp('('+terms.map(escapeRegex).join('|')+')','gi')
  const parts=text.split(pattern)
  return <>{parts.map((part,index)=>terms.some((term)=>part.toLocaleLowerCase()===term.toLocaleLowerCase())?<mark key={index}>{part}</mark>:<span key={index}>{part}</span>)}</>
}

function typeLabel(type:SearchOwnerType){return TYPES.find((item)=>item.value===type)?.label.slice(0,-1)??type}

export function SearchView({projects,tags,onOpenResult}:{projects:ProjectSummary[];tags:TagEntity[];onOpenResult:(hit:ContentSearchHit)=>void}){
  const [query,setQuery]=useState('')
  const [filters,setFilters]=useState<SearchFilters>(defaultFilters)
  const [results,setResults]=useState<ContentSearchHit[]>([])
  const [searching,setSearching]=useState(false)
  const [activeIndex,setActiveIndex]=useState(0)
  const [showAdvanced,setShowAdvanced]=useState(false)
  const [saveName,setSaveName]=useState('')
  const [showSave,setShowSave]=useState(false)
  const [error,setError]=useState('')
  const inputRef=useRef<HTMLInputElement>(null)
  const saved=useLiveQuery(()=>searchPreferencesService.listSaved(),[],[])??[]
  const recent=useLiveQuery(()=>searchPreferencesService.listRecent(),[],[])??[]

  useEffect(()=>{inputRef.current?.focus()},[])

  useEffect(()=>{
    let alive=true
    const shouldSearch=Boolean(query.trim()||hasFilters(filters))
    if(!shouldSearch){setResults([]);setSearching(false);return}
    setSearching(true)
    const timer=window.setTimeout(()=>{
      void contentSearchService.search(query,filters).then((hits)=>{
        if(!alive)return
        setResults(hits)
        setActiveIndex(0)
        setSearching(false)
      }).catch((reason)=>{
        if(!alive)return
        setError(reason instanceof Error?reason.message:'Search failed.')
        setSearching(false)
      })
    },120)
    return()=>{alive=false;window.clearTimeout(timer)}
  },[query,filters])

  function toggleType(type:SearchOwnerType){
    setFilters((current)=>{
      const selected=current.types??[]
      return {...current,types:selected.includes(type)?selected.filter((item)=>item!==type):[...selected,type]}
    })
  }

  function applySearch(nextQuery:string,nextFilters:SearchFilters){
    setQuery(nextQuery)
    setFilters({...defaultFilters(),...nextFilters,types:[...(nextFilters.types??[])]})
    setShowAdvanced(Boolean(nextFilters.projectId||nextFilters.tagId||nextFilters.updatedWithinDays||nextFilters.dateFrom||nextFilters.dateTo))
    setActiveIndex(0)
    window.setTimeout(()=>inputRef.current?.focus(),0)
  }

  async function open(hit:ContentSearchHit){
    await searchPreferencesService.remember(query,filters)
    onOpenResult(hit)
  }

  async function save(){
    setError('')
    try{
      await searchPreferencesService.save(saveName,query,filters)
      setSaveName('')
      setShowSave(false)
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not save search.')}
  }

  const parsed=parseSearchQuery(query)
  const active=results[activeIndex]
  const searched=Boolean(query.trim()||hasFilters(filters))
  const operatorNote=parsed.types.length||parsed.status||parsed.includeArchived||parsed.dateFrom||parsed.dateTo

  return <div className="search-v2-view">
    <PageHeader kicker="Search everything, locally" title="Search" subtitle="Find tasks, notes, projects, habits, reviews, comments, attachment metadata, and tags from one offline index." />

    <section className="search-v2-shell">
      <div className="search-v2-input-row">
        <span aria-hidden="true">⌕</span>
        <input ref={inputRef} value={query} onChange={(event)=>setQuery(event.target.value)} placeholder='Search Folio…  Try "exam proof", type:note, status:open' aria-label="Search Folio"
          onKeyDown={(event)=>{
            if(event.key==='ArrowDown'){event.preventDefault();setActiveIndex((index)=>Math.min(results.length-1,index+1))}
            else if(event.key==='ArrowUp'){event.preventDefault();setActiveIndex((index)=>Math.max(0,index-1))}
            else if(event.key==='Enter'&&active){event.preventDefault();void open(active)}
          }}/>
        {query||hasFilters(filters)?<button onClick={()=>{setQuery('');setFilters(defaultFilters());setResults([]);setActiveIndex(0)}}>Clear</button>:null}
      </div>

      <div className="search-v2-type-row">
        <button className={!filters.types?.length?'is-active':''} onClick={()=>setFilters((current)=>({...current,types:[]}))}>All</button>
        {TYPES.map((item)=><button key={item.value} className={filters.types?.includes(item.value)?'is-active':''} onClick={()=>toggleType(item.value)}>{item.label}</button>)}
      </div>

      <div className="search-v2-filter-row">
        <label><span>Status</span><select value={filters.status??'all'} onChange={(event)=>setFilters((current)=>({...current,status:event.target.value as SearchStatusFilter}))}><option value="all">Any status</option><option value="open">Open / active</option><option value="completed">Completed</option></select></label>
        <label><span>Sort</span><select value={filters.sort??'relevance'} onChange={(event)=>setFilters((current)=>({...current,sort:event.target.value as SearchSort}))}><option value="relevance">Relevance</option><option value="recent">Recently updated</option><option value="title">Title A–Z</option></select></label>
        <label className="search-v2-archive-toggle"><input type="checkbox" checked={Boolean(filters.includeArchived)} onChange={(event)=>setFilters((current)=>({...current,includeArchived:event.target.checked}))}/><span>Include archived</span></label>
        <Button onClick={()=>setShowAdvanced((value)=>!value)}>{showAdvanced?'Fewer filters':'More filters'}</Button>
        <Button onClick={()=>setShowSave((value)=>!value)}>Save search</Button>
      </div>

      {showAdvanced?<div className="search-v2-advanced">
        <label><span>Project</span><select value={filters.projectId??''} onChange={(event)=>setFilters((current)=>({...current,projectId:event.target.value||undefined}))}><option value="">Any project</option>{projects.map((project)=><option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        <label><span>Tag</span><select value={filters.tagId??''} onChange={(event)=>setFilters((current)=>({...current,tagId:event.target.value||undefined}))}><option value="">Any tag</option>{tags.filter((tag)=>!tag.archived).map((tag)=><option key={tag.id} value={tag.id}>#{tag.name}</option>)}</select></label>
        <label><span>Updated</span><select value={filters.updatedWithinDays??''} onChange={(event)=>setFilters((current)=>({...current,updatedWithinDays:event.target.value?Number(event.target.value):undefined}))}><option value="">Any time</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="365">Last year</option></select></label>
        <label><span>Date from</span><input type="date" value={filters.dateFrom??''} onChange={(event)=>setFilters((current)=>({...current,dateFrom:event.target.value||undefined}))}/></label>
        <label><span>Date through</span><input type="date" value={filters.dateTo??''} onChange={(event)=>setFilters((current)=>({...current,dateTo:event.target.value||undefined}))}/></label>
      </div>:null}

      {showSave?<div className="search-v2-save"><input value={saveName} onChange={(event)=>setSaveName(event.target.value)} placeholder="Saved search name…" maxLength={80}/><Button variant="primary" disabled={!saveName.trim()} onClick={()=>void save()}>Save</Button></div>:null}
      {operatorNote?<div className="search-v2-operator-note">Inline filters detected. Supported: <code>type:task</code>, <code>status:open</code>, <code>is:archived</code>, <code>after:YYYY-MM-DD</code>, <code>before:YYYY-MM-DD</code>.</div>:null}
      {error?<div className="form-error">{error}</div>:null}
    </section>

    {!searched?<section className="search-v2-start">
      <div className="search-v2-saved">
        <div className="search-v2-section-head"><div><span className="eyebrow">Saved</span><h2>Saved searches</h2></div><span>{saved.length}</span></div>
        <div className="search-v2-chip-list">{saved.map((item)=><div key={item.id}><button onClick={()=>applySearch(item.query,item.filters)}><strong>{item.name}</strong><span>{item.query||'Filtered search'}</span></button><button aria-label={'Delete '+item.name} onClick={()=>void searchPreferencesService.removeSaved(item.id)}>×</button></div>)}{!saved.length?<p>Save a useful query and its complete filter state here.</p>:null}</div>
      </div>
      <div className="search-v2-saved">
        <div className="search-v2-section-head"><div><span className="eyebrow">Recent</span><h2>Recent searches</h2></div>{recent.length?<button onClick={()=>void searchPreferencesService.clearRecent()}>Clear</button>:null}</div>
        <div className="search-v2-chip-list">{recent.map((item)=><div key={item.id}><button onClick={()=>applySearch(item.query,item.filters)}><strong>{item.query||'Filtered search'}</strong><span>{new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(item.usedAt))}</span></button></div>)}{!recent.length?<p>Queries appear here after you open a result.</p>:null}</div>
      </div>
    </section>:<section className="search-v2-results">
      <div className="search-v2-section-head"><div><span className="eyebrow">Results</span><h2>{searching?'Searching…':results.length+' match'+(results.length===1?'':'es')}</h2></div><span>↑ ↓ + Enter</span></div>
      <div className="search-v2-result-list" role="listbox" aria-label="Search results">
        {results.map((hit,index)=><button id={'search-hit-'+hit.ownerType+'-'+hit.ownerId} key={hit.ownerType+':'+hit.ownerId} className={index===activeIndex?'is-active':''} role="option" aria-selected={index===activeIndex} onMouseEnter={()=>setActiveIndex(index)} onClick={()=>void open(hit)}>
          <span className={'search-v2-result-type type-'+hit.ownerType}>{typeLabel(hit.ownerType)}</span>
          <div><strong><Highlighted text={hit.title} query={query}/></strong>{hit.snippet?<p><Highlighted text={hit.snippet} query={query}/></p>:null}<small>{hit.meta}{hit.matchedFields.length?' · matched '+hit.matchedFields.join(', '):''}</small></div>
          <time>{new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric'}).format(new Date(hit.updatedAt))}</time>
        </button>)}
        {!searching&&!results.length?<div className="search-v2-empty"><strong>No results</strong><span>Try removing filters, using fewer words, or relying on typo-tolerant matching.</span></div>:null}
      </div>
    </section>}
  </div>
}
