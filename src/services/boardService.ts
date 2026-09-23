import type { KanbanDropTarget } from '../features/boards/KanbanBoard'
import { organizationService } from './organizationService'
import { taskService } from './taskService'
import type { UndoableMutation } from './undo'

export const boardService = {
  async moveTask(taskId:string,target:KanbanDropTarget,context?:{listId?:string}):Promise<UndoableMutation> {
    if(target.kind==='section') {
      if(!context?.listId) throw new Error('Section boards require a list context.')
      return organizationService.moveTask(taskId,context.listId,target.value)
    }
    if(target.kind==='list') return organizationService.moveTask(taskId,target.value,undefined)
    if(target.kind==='project') return taskService.update(taskId,{projectId:target.value??null})
    if(target.kind==='priority') return taskService.update(taskId,{priority:target.value})
    if(target.kind==='status') {
      const taskAction=await taskService.setCompleted(taskId,target.value==='completed')
      return {...taskAction,message:target.value==='completed'?'Task moved to Completed':'Task moved to Open'}
    }
    throw new Error('Unsupported board target.')
  },
}
