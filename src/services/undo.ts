export interface UndoableMutation {
  message: string
  undo: () => Promise<void>
}
