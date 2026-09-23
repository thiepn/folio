import type { TaskPreview } from '../../types/ui'
import { boardGroupKey, normalizeTimelineSpan, shiftTimelineSpan, timelineDayOffset, timelineIntersects } from './boardTimelineLogic'

function preview(id:string,partial:Partial<TaskPreview>={}):TaskPreview {
  return { id,title:id,priority:'normal',completed:false,status:'todo',rescheduleCount:0,...partial }
}

export function validateBoardTimelineCases() {
  const failures:string[]=[]

  const span=normalizeTimelineSpan('2026-09-23','2026-09-27',false)
  if(!span||span.start!=='2026-09-23'||span.end!=='2026-09-27'||span.milestone) failures.push('normal span normalization')

  const milestone=normalizeTimelineSpan('2026-09-23','2026-09-30',true)
  if(!milestone||milestone.end!=='2026-09-23'||!milestone.milestone) failures.push('milestone normalization')

  let reversedRejected=false
  try { normalizeTimelineSpan('2026-09-27','2026-09-23',false) } catch { reversedRejected=true }
  if(!reversedRejected) failures.push('reversed timeline span accepted')

  const shifted=shiftTimelineSpan(span!,3)
  if(shifted.start!=='2026-09-26'||shifted.end!=='2026-09-30') failures.push('timeline span shift')

  const shiftedMilestone=shiftTimelineSpan(milestone!,2)
  if(shiftedMilestone.start!=='2026-09-25'||shiftedMilestone.end!=='2026-09-25') failures.push('milestone shift')

  if(timelineDayOffset('2026-09-23','2026-10-01')!==8) failures.push('timeline day offset')
  if(!timelineIntersects(span!,'2026-09-25','2026-10-01')) failures.push('timeline intersection expected')
  if(timelineIntersects(span!,'2026-09-28','2026-10-01')) failures.push('timeline false intersection')

  const section=preview('s',{sectionId:'section-a'})
  const noSection=preview('n')
  const completed=preview('c',{completed:true,status:'completed'})
  const project=preview('p',{projectId:'project-a'})
  const list=preview('l',{listId:'list-a'})
  const critical=preview('x',{priority:'critical'})

  if(boardGroupKey(section,'section')!=='section-a'||boardGroupKey(noSection,'section')!=='__none__') failures.push('section board grouping')
  if(boardGroupKey(completed,'status')!=='completed'||boardGroupKey(noSection,'status')!=='todo') failures.push('status board grouping')
  if(boardGroupKey(project,'project')!=='project-a') failures.push('project board grouping')
  if(boardGroupKey(list,'list')!=='list-a') failures.push('list board grouping')
  if(boardGroupKey(critical,'priority')!=='critical') failures.push('priority board grouping')

  return failures
}
