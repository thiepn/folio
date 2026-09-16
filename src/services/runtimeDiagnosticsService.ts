import { ensurePlatformCompatibility } from './platformCompatibility'
import { verifyDatabaseIntegrity } from './storageSafetyService'
import { taskRepository } from '../repositories/taskRepository'
import { projectRepository } from '../repositories/projectRepository'
import { habitRepository } from '../repositories/habitRepository'
import { timeBlockRepository } from '../repositories/timeBlockRepository'
import { focusSessionRepository } from '../repositories/focusSessionRepository'
import { recurrenceRepository } from '../repositories/recurrenceRepository'

export interface RuntimeDiagnosticsReport {
  checkedAt: string
  integrityRows: number
  integrityWarnings: string[]
  queryProbeMs: number
  queriedRows: number
  queryRating: 'fast' | 'acceptable' | 'slow'
  compatibilityWarnings: string[]
  reducedMotion: boolean
  online: boolean
}

export async function runRuntimeDiagnostics(): Promise<RuntimeDiagnosticsReport> {
  const integrity = await verifyDatabaseIntegrity()
  const started = performance.now()
  const [tasks, projects, habits, blocks, sessions, series] = await Promise.all([
    taskRepository.listSnapshot(),
    projectRepository.listAll(),
    habitRepository.listActive(),
    timeBlockRepository.listAll(),
    focusSessionRepository.listAll(),
    recurrenceRepository.listAll(),
  ])
  const queryProbeMs = Math.max(0, performance.now() - started)
  const queriedRows = tasks.length + projects.length + habits.length + blocks.length + sessions.length + series.length
  const queryRating = queryProbeMs <= 150 ? 'fast' : queryProbeMs <= 600 ? 'acceptable' : 'slow'
  const compatibility = ensurePlatformCompatibility()
  return {
    checkedAt: new Date().toISOString(),
    integrityRows: integrity.entityCount,
    integrityWarnings: integrity.warnings,
    queryProbeMs,
    queriedRows,
    queryRating,
    compatibilityWarnings: compatibility.warnings,
    reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
    online: navigator.onLine,
  }
}
