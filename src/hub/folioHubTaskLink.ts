/** Stage 1G. A deliberately narrow URL handoff into Folio's existing
 * TaskInspector. The URL contains only a Folio-owned ID, never task text,
 * credentials or workspace data. This is not a new task route.
 */
export const FOLIO_HUB_TASK_LINK_PARAM='hubTask' as const
const ID=/^[A-Za-z0-9_-]{1,128}$/
export function validHubTaskId(id:unknown):id is string {
  return typeof id==='string'&&ID.test(id)
}
/** Consume exactly once before accessing task content. Preserve view and
 * other Folio navigation parameters. Untrusted/malformed values fail closed. */
export function consumeFolioHubTaskLink():string|null {
  const url=new URL(window.location.href)
  if(!url.searchParams.has(FOLIO_HUB_TASK_LINK_PARAM))return null
  const id=url.searchParams.get(FOLIO_HUB_TASK_LINK_PARAM)
  url.searchParams.delete(FOLIO_HUB_TASK_LINK_PARAM)
  window.history.replaceState(window.history.state,'',url.pathname+url.search+url.hash)
  return validHubTaskId(id)?id:null
}
