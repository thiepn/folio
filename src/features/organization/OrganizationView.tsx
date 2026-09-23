import { useMemo, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { TaskRow } from '../../components/ui/TaskRow'
import type { FolderEntity, ListEntity, SectionEntity, TagEntity } from '../../domain/models'
import type { TaskPreview } from '../../types/ui'
import type { FolderUpdateInput, ListUpdateInput, TagUpdateInput } from '../../repositories/organizationRepository'

type SmartId = '__all__' | '__unlisted__' | '__high__' | '__unscheduled__'

function sortTasks(tasks: TaskPreview[], mode: ListEntity['sortMode']) {
  const rows=[...tasks]
  if(mode==='planned') return rows.sort((a,b)=>(a.plannedDate??'9999').localeCompare(b.plannedDate??'9999')||a.title.localeCompare(b.title))
  if(mode==='deadline') return rows.sort((a,b)=>(a.deadline??'9999').localeCompare(b.deadline??'9999')||a.title.localeCompare(b.title))
  if(mode==='priority') { const rank={critical:0,high:1,normal:2}; return rows.sort((a,b)=>rank[a.priority]-rank[b.priority]||a.title.localeCompare(b.title)) }
  if(mode==='title') return rows.sort((a,b)=>a.title.localeCompare(b.title))
  if(mode==='created') return rows.sort((a,b)=>(a.createdAt??'').localeCompare(b.createdAt??''))
  if(mode==='updated') return rows.sort((a,b)=>(b.updatedAt??'').localeCompare(a.updatedAt??''))
  return rows
}

function smartTasks(id: SmartId, tasks: TaskPreview[]) {
  if(id==='__unlisted__') return tasks.filter((task)=>task.status!=='inbox'&&!task.listId)
  if(id==='__high__') return tasks.filter((task)=>task.status==='todo'&&(task.priority==='critical'||task.priority==='high'))
  if(id==='__unscheduled__') return tasks.filter((task)=>task.status==='todo'&&!task.plannedDate)
  return tasks.filter((task)=>task.status!=='inbox'&&task.status!=='cancelled')
}

export function OrganizationView({
  folders, archivedFolders, lists, archivedLists, sections, tags, archivedTags, tasks, listCounts, tagCounts, selectedListId,
  onSelectList, onCreateFolder, onCreateList, onCreateSection, onCreateTag,
  onUpdateList, onUpdateFolder, onUpdateTag, onMergeTag, onArchiveSection,
  onOpenTask, onToggleTask, onMoveTask, onAddTask,
}: {
  folders: FolderEntity[]
  archivedFolders: FolderEntity[]
  lists: ListEntity[]
  archivedLists: ListEntity[]
  sections: SectionEntity[]
  tags: TagEntity[]
  archivedTags: TagEntity[]
  tasks: TaskPreview[]
  listCounts: Record<string, number>
  tagCounts: Record<string, number>
  selectedListId: string | null
  onSelectList: (id: string | null) => void
  onCreateFolder: (name: string) => Promise<void>
  onCreateList: (name: string, folderId?: string) => Promise<void>
  onCreateSection: (listId: string, name: string) => Promise<void>
  onCreateTag: (name: string, parentTagId?: string) => Promise<void>
  onUpdateList: (id: string, changes: ListUpdateInput) => Promise<void>
  onUpdateFolder: (id: string, changes: FolderUpdateInput) => Promise<void>
  onUpdateTag: (id: string, changes: TagUpdateInput) => Promise<void>
  onMergeTag: (sourceId: string, targetId: string) => Promise<void>
  onArchiveSection: (id: string) => Promise<void>
  onOpenTask: (id: string) => void
  onToggleTask: (id: string) => void
  onMoveTask: (taskId: string, listId?: string, sectionId?: string) => Promise<void>
  onAddTask: (listId?: string, sectionId?: string) => void
}) {
  const [newFolder,setNewFolder]=useState('')
  const [newList,setNewList]=useState('')
  const [newListFolder,setNewListFolder]=useState('')
  const [newTag,setNewTag]=useState('')
  const [newTagParent,setNewTagParent]=useState('')
  const [mergeSource,setMergeSource]=useState('')
  const [mergeTarget,setMergeTarget]=useState('')

  const selectedList = lists.find((list)=>list.id===selectedListId)
  const selectedTagId = selectedListId?.startsWith('__tag__:') ? selectedListId.slice('__tag__:'.length) : undefined
  const selectedTag = selectedTagId ? tags.find((tag)=>tag.id===selectedTagId) : undefined
  const smart = selectedListId && ['__all__','__unlisted__','__high__','__unscheduled__'].includes(selectedListId) ? selectedListId as SmartId : null

  const tagScopeIds = (rootId: string) => {
    const result = new Set<string>([rootId])
    let changed = true
    while (changed) {
      changed = false
      for (const tag of tags) if (tag.parentTagId && result.has(tag.parentTagId) && !result.has(tag.id)) { result.add(tag.id); changed = true }
    }
    return result
  }

  if(selectedList || smart || selectedTag) {
    const scopedTagIds = selectedTag ? tagScopeIds(selectedTag.id) : undefined
    return <ListWorkspace
      key={selectedList?.id ?? smart ?? selectedTag?.id}
      list={selectedList}
      smart={smart}
      titleOverride={selectedTag ? '#'+selectedTag.name : undefined}
      folders={folders}
      sections={sections.filter((section)=>section.listId===selectedList?.id)}
      tags={tags}
      tasks={selectedList
        ? tasks.filter((task)=>task.listId===selectedList.id)
        : selectedTag
          ? tasks.filter((task)=>task.status!=='inbox' && task.tagIds?.some((id)=>scopedTagIds?.has(id)))
          : smartTasks(smart!,tasks)}
      onBack={()=>onSelectList(null)}
      onUpdateList={onUpdateList}
      onCreateSection={onCreateSection}
      onArchiveSection={onArchiveSection}
      onOpenTask={onOpenTask}
      onToggleTask={onToggleTask}
      onMoveTask={onMoveTask}
      onAddTask={onAddTask}
    />
  }

  const rootLists=lists.filter((list)=>!list.folderId)
  const tagsByParent=new Map<string|undefined,TagEntity[]>()
  for(const tag of tags){const key=tag.parentTagId;const row=tagsByParent.get(key)??[];row.push(tag);tagsByParent.set(key,row)}

  return <div className="organization-view">
    <header className="page-header organization-header">
      <div><span className="eyebrow">Organization</span><h1>Lists & tags</h1><p>Separate durable organization from projects, dates, and execution.</p></div>
      <Button variant="primary" onClick={()=>onAddTask()}>New task</Button>
    </header>

    <section className="organization-smart">
      <button onClick={()=>onSelectList('__all__')}><strong>All tasks</strong><span>{tasks.filter((task)=>task.status!=='inbox'&&task.status!=='cancelled').length}</span></button>
      <button onClick={()=>onSelectList('__unlisted__')}><strong>No list</strong><span>{tasks.filter((task)=>task.status!=='inbox'&&!task.listId).length}</span></button>
      <button onClick={()=>onSelectList('__high__')}><strong>High priority</strong><span>{tasks.filter((task)=>task.status==='todo'&&(task.priority==='critical'||task.priority==='high')).length}</span></button>
      <button onClick={()=>onSelectList('__unscheduled__')}><strong>Unscheduled</strong><span>{tasks.filter((task)=>task.status==='todo'&&!task.plannedDate).length}</span></button>
    </section>

    <section className="organization-panel">
      <div className="organization-panel__head"><div><span className="eyebrow">Lists</span><h2>Folders & lists</h2></div></div>
      <div className="organization-create-grid">
        <form onSubmit={(e)=>{e.preventDefault();if(newFolder.trim())void onCreateFolder(newFolder.trim()).then(()=>setNewFolder(''))}}>
          <input value={newFolder} onChange={(e)=>setNewFolder(e.target.value)} placeholder="New folder" /><Button type="submit" disabled={!newFolder.trim()}>Add folder</Button>
        </form>
        <form onSubmit={(e)=>{e.preventDefault();if(newList.trim())void onCreateList(newList.trim(),newListFolder||undefined).then(()=>setNewList(''))}}>
          <input value={newList} onChange={(e)=>setNewList(e.target.value)} placeholder="New list" />
          <select value={newListFolder} onChange={(e)=>setNewListFolder(e.target.value)}><option value="">Root</option>{folders.map((folder)=><option key={folder.id} value={folder.id}>{folder.name}</option>)}</select>
          <Button type="submit" disabled={!newList.trim()}>Add list</Button>
        </form>
      </div>
      <div className="folder-tree">
        {rootLists.length?<ListButtons lists={rootLists} counts={listCounts} onSelect={onSelectList} onUpdate={onUpdateList}/>:null}
        {folders.map((folder)=>{
          const childLists=lists.filter((list)=>list.folderId===folder.id)
          return <section className="folder-card" key={folder.id}>
            <header><button className="folder-collapse" onClick={()=>void onUpdateFolder(folder.id,{collapsed:!folder.collapsed})}>{folder.collapsed?'▸':'▾'}</button><strong>{folder.name}</strong><span>{childLists.length} list{childLists.length===1?'':'s'}</span><button className="text-action" onClick={()=>void onUpdateFolder(folder.id,{archived:true})}>Archive</button></header>
            {!folder.collapsed?<ListButtons lists={childLists} counts={listCounts} onSelect={onSelectList} onUpdate={onUpdateList}/>:null}
          </section>
        })}
      </div>
    </section>

    {(archivedFolders.length || archivedLists.length || archivedTags.length) ? <section className="organization-panel">
      <div className="organization-panel__head"><div><span className="eyebrow">Archive</span><h2>Archived organization</h2></div></div>
      {archivedFolders.length ? <><div className="section-label">Folders</div><div className="archived-tag-list">{archivedFolders.map((folder)=><button key={folder.id} onClick={()=>void onUpdateFolder(folder.id,{archived:false})}>{folder.name} · Restore</button>)}</div></> : null}
      {archivedLists.length ? <><div className="section-label">Lists</div><div className="organization-list-grid">{archivedLists.map((list)=><div className="organization-list-card" key={list.id}><button className="organization-list-card__open" onClick={()=>void onUpdateList(list.id,{archived:false})}><i style={{background:list.color??'var(--muted)'}}/><span><strong>{list.name}</strong><small>Restore list</small></span></button></div>)}</div></> : null}
      {archivedTags.length ? <><div className="section-label">Tags</div><div className="archived-tag-list">{archivedTags.map((tag)=><button key={tag.id} onClick={()=>void onUpdateTag(tag.id,{archived:false})}>#{tag.name} · Restore</button>)}</div></> : null}
    </section> : null}

    <section className="organization-panel">
      <div className="organization-panel__head"><div><span className="eyebrow">Tags</span><h2>Global tag tree</h2></div></div>
      <form className="tag-create-row" onSubmit={(e)=>{e.preventDefault();if(newTag.trim())void onCreateTag(newTag.trim(),newTagParent||undefined).then(()=>setNewTag(''))}}>
        <input value={newTag} onChange={(e)=>setNewTag(e.target.value)} placeholder="New tag" />
        <select value={newTagParent} onChange={(e)=>setNewTagParent(e.target.value)}><option value="">Top level</option>{tags.map((tag)=><option key={tag.id} value={tag.id}>#{tag.name}</option>)}</select>
        <Button type="submit" disabled={!newTag.trim()}>Add tag</Button>
      </form>
      <form className="tag-merge-row" onSubmit={(e)=>{e.preventDefault();if(mergeSource&&mergeTarget&&mergeSource!==mergeTarget)void onMergeTag(mergeSource,mergeTarget).then(()=>{setMergeSource('');setMergeTarget('')})}}>
        <select value={mergeSource} onChange={(e)=>setMergeSource(e.target.value)}><option value="">Merge tag…</option>{tags.map((tag)=><option key={tag.id} value={tag.id}>#{tag.name}</option>)}</select>
        <span>into</span>
        <select value={mergeTarget} onChange={(e)=>setMergeTarget(e.target.value)}><option value="">Target tag…</option>{tags.filter((tag)=>tag.id!==mergeSource).map((tag)=><option key={tag.id} value={tag.id}>#{tag.name}</option>)}</select>
        <Button type="submit" disabled={!mergeSource||!mergeTarget||mergeSource===mergeTarget}>Merge</Button>
      </form>
      <div className="tag-tree">
        {(tagsByParent.get(undefined)??[]).map((tag)=><TagBranch key={tag.id} tag={tag} byParent={tagsByParent} counts={tagCounts} onUpdate={onUpdateTag} onOpen={(id)=>onSelectList('__tag__:'+id)}/>)}
        {!tags.length?<div className="empty-state">Tags captured through Quick Add will appear here automatically.</div>:null}
      </div>
    </section>
  </div>
}

function ListButtons({lists,counts,onSelect,onUpdate}:{lists:ListEntity[];counts:Record<string,number>;onSelect:(id:string)=>void;onUpdate:(id:string,changes:ListUpdateInput)=>Promise<void>}) {
  if(!lists.length) return <div className="organization-empty-row">No lists here.</div>
  return <div className="organization-list-grid">{lists.map((list)=><div className="organization-list-card" key={list.id}>
    <button className="organization-list-card__open" onClick={()=>onSelect(list.id)}><i style={{background:list.color??'var(--accent)'}}/><span><strong>{list.name}</strong><small>{counts[list.id]??0} open tasks</small></span></button>
    <button className={list.favorite?'is-favorite':''} aria-label={list.favorite?'Unfavorite list':'Favorite list'} onClick={()=>void onUpdate(list.id,{favorite:!list.favorite})}>★</button>
  </div>)}</div>
}

function TagBranch({tag,byParent,counts,onUpdate,onOpen}:{tag:TagEntity;byParent:Map<string|undefined,TagEntity[]>;counts:Record<string,number>;onUpdate:(id:string,changes:TagUpdateInput)=>Promise<void>;onOpen:(id:string)=>void}) {
  const children=byParent.get(tag.id)??[]
  return <div className="tag-branch">
    <div className="tag-row"><button className="tag-row__name" onClick={()=>onOpen(tag.id)}>#{tag.name}</button><span>{counts[tag.id]??0}</span><button className={tag.favorite?'is-favorite':''} aria-label={tag.favorite?'Unfavorite tag':'Favorite tag'} onClick={()=>void onUpdate(tag.id,{favorite:!tag.favorite})}>★</button><button aria-label={'Archive #'+tag.name} onClick={()=>void onUpdate(tag.id,{archived:true})}>×</button></div>
    {children.length?<div className="tag-children">{children.map((child)=><TagBranch key={child.id} tag={child} byParent={byParent} counts={counts} onUpdate={onUpdate} onOpen={onOpen}/>)}</div>:null}
  </div>
}

function ListWorkspace({list,smart,titleOverride,folders,sections,tags,tasks,onBack,onUpdateList,onCreateSection,onArchiveSection,onOpenTask,onToggleTask,onMoveTask,onAddTask}:{
  list?:ListEntity;smart:SmartId|null;titleOverride?:string;folders:FolderEntity[];sections:SectionEntity[];tags:TagEntity[];tasks:TaskPreview[];
  onBack:()=>void;onUpdateList:(id:string,changes:Partial<ListEntity>)=>Promise<void>;onCreateSection:(listId:string,name:string)=>Promise<void>;onArchiveSection:(id:string)=>Promise<void>;
  onOpenTask:(id:string)=>void;onToggleTask:(id:string)=>void;onMoveTask:(taskId:string,listId?:string,sectionId?:string)=>Promise<void>;onAddTask:(listId?:string,sectionId?:string)=>void
}) {
  const [sectionName,setSectionName]=useState('')
  const [name,setName]=useState(list?.name??'')
  const [description,setDescription]=useState(list?.description??'')
  const [folderId,setFolderId]=useState(list?.folderId??'')
  const [color,setColor]=useState(list?.color??'#53657d')
  const [icon,setIcon]=useState(list?.icon??'')
  const title=titleOverride??list?.name??({__all__:'All tasks',__unlisted__:'No list',__high__:'High priority',__unscheduled__:'Unscheduled'} as Record<SmartId,string>)[smart!]
  const visible=useMemo(()=>sortTasks(tasks.filter((task)=>list?.showCompleted===false?!task.completed:true),list?.sortMode??'planned'),[tasks,list?.showCompleted,list?.sortMode])
  const groups=useMemo(()=>{
    const mode=list?.groupMode??'none'
    if(mode==='section'&&list){
      const result=sections.map((section)=>({key:section.id,label:section.name,tasks:visible.filter((task)=>task.sectionId===section.id)}))
      result.push({key:'__none__',label:'No section',tasks:visible.filter((task)=>!task.sectionId)})
      return result
    }
    if(mode==='priority') return ['critical','high','normal'].map((key)=>({key,label:key[0].toUpperCase()+key.slice(1),tasks:visible.filter((task)=>task.priority===key)}))
    if(mode==='planned') {
      return [
        {key:'dated',label:'Scheduled',tasks:visible.filter((task)=>task.plannedDate)},
        {key:'none',label:'Unscheduled',tasks:visible.filter((task)=>!task.plannedDate)},
      ]
    }
    if(mode==='tag') {
      const activeTagIds = new Set(tags.map((tag)=>tag.id))
      const used=tags.filter((tag)=>visible.some((task)=>task.tagIds?.includes(tag.id)))
      const result=used.map((tag)=>({key:tag.id,label:'#'+tag.name,tasks:visible.filter((task)=>task.tagIds?.includes(tag.id))}))
      result.push({key:'untagged',label:'Untagged',tasks:visible.filter((task)=>!task.tagIds?.some((id)=>activeTagIds.has(id)))})
      return result
    }
    return [{key:'all',label:'Tasks',tasks:visible}]
  },[visible,list,sections,tags])

  return <div className="list-workspace">
    <header className="page-header list-workspace__header">
      <div><button className="text-action" onClick={onBack}>← Lists & tags</button><h1>{title}</h1><p>{list?.description||'A focused task collection.'}</p></div>
      <div>{list?<Button onClick={()=>void onUpdateList(list.id,{favorite:!list.favorite})}>{list.favorite?'Unfavorite':'Favorite'}</Button>:null}<Button variant="primary" onClick={()=>onAddTask(list?.id)}>Add task</Button></div>
    </header>
    {list?<section className="list-metadata-editor">
      <label><span>Name</span><input value={name} onChange={(e)=>setName(e.target.value)}/></label>
      <label><span>Description</span><input value={description} onChange={(e)=>setDescription(e.target.value)}/></label>
      <label><span>Folder</span><select value={folderId} onChange={(e)=>setFolderId(e.target.value)}><option value="">Root</option>{folders.map((folder)=><option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>
      <label><span>Accent</span><input type="color" value={color} onChange={(e)=>setColor(e.target.value)}/></label>
      <label><span>Icon</span><input value={icon} maxLength={24} onChange={(e)=>setIcon(e.target.value)} placeholder="Optional"/></label>
      <Button disabled={!name.trim()} onClick={()=>void onUpdateList(list.id,{name:name.trim(),description,folderId:folderId||null,color,icon:icon.trim()||undefined})}>Save list</Button>
    </section>:null}
    {list?<section className="list-controls">
      <label><span>Sort</span><select value={list.sortMode} onChange={(e)=>void onUpdateList(list.id,{sortMode:e.target.value as ListEntity['sortMode']})}><option value="manual">Manual</option><option value="planned">Planned date</option><option value="deadline">Deadline</option><option value="priority">Priority</option><option value="title">Title</option><option value="created">Created</option><option value="updated">Recently updated</option></select></label>
      <label><span>Group</span><select value={list.groupMode} onChange={(e)=>void onUpdateList(list.id,{groupMode:e.target.value as ListEntity['groupMode']})}><option value="section">Sections</option><option value="none">None</option><option value="planned">Scheduling</option><option value="priority">Priority</option><option value="tag">Tag</option></select></label>
      <label className="list-toggle"><input type="checkbox" checked={list.showCompleted} onChange={(e)=>void onUpdateList(list.id,{showCompleted:e.target.checked})}/><span>Show completed</span></label>
      <Button onClick={()=>void onUpdateList(list.id,{archived:true})}>Archive list</Button>
    </section>:null}
    {list?<form className="section-create" onSubmit={(e)=>{e.preventDefault();if(sectionName.trim())void onCreateSection(list.id,sectionName.trim()).then(()=>setSectionName(''))}}><input value={sectionName} onChange={(e)=>setSectionName(e.target.value)} placeholder="New section"/><Button type="submit" disabled={!sectionName.trim()}>Add section</Button></form>:null}
    <div className="list-groups">
      {groups.map((group)=><section className="list-group" key={group.key}>
        <header><div><span className="eyebrow">{group.label}</span><strong>{group.tasks.length}</strong></div>{list&&group.key!=='__none__'&&sections.some((section)=>section.id===group.key)?<button className="text-action" onClick={()=>void onArchiveSection(group.key)}>Archive section</button>:null}</header>
        <div className="task-list">{group.tasks.map((task)=><div className="organized-task" key={task.id}><TaskRow task={task} onToggle={onToggleTask} onOpen={onOpenTask}/>{list?<select aria-label={'Move '+task.title+' to section'} value={task.sectionId??''} onChange={(e)=>void onMoveTask(task.id,list.id,e.target.value||undefined)}><option value="">No section</option>{sections.map((section)=><option key={section.id} value={section.id}>{section.name}</option>)}</select>:null}</div>)}</div>
        {!group.tasks.length?<div className="empty-state">No tasks in this group.</div>:null}
      </section>)}
    </div>
  </div>
}
