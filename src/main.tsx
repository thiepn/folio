import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { AppErrorBoundary } from './components/system/AppErrorBoundary'
import { CompatibilityState } from './components/layout/CompatibilityState'
import { FatalRecoveryState } from './components/layout/FatalRecoveryState'
import { StartupState } from './components/layout/StartupState'
import { initializeDatabase, runStartupMaintenance } from './services/databaseService'
import { pwaService } from './services/pwaService'
import { ensurePlatformCompatibility } from './services/platformCompatibility'
import { installGlobalRuntimeIssueHandlers } from './services/runtimeIssueService'
import './styles/index.css'

async function bootstrap() {
  const root = createRoot(document.getElementById('root')!)
  root.render(<StrictMode><StartupState /></StrictMode>)
  installGlobalRuntimeIssueHandlers()
  const compatibility = ensurePlatformCompatibility()
  if (!compatibility.supported) {
    root.render(<StrictMode><CompatibilityState report={compatibility} /></StrictMode>)
    return
  }

  void pwaService.register()
  try {
    await initializeDatabase()
    root.render(<StrictMode><AppErrorBoundary><App /></AppErrorBoundary></StrictMode>)
    void runStartupMaintenance()
  } catch (error) {
    console.error('Database initialization failed', error)
    root.render(<StrictMode><FatalRecoveryState error={error} /></StrictMode>)
  }
}

void bootstrap()
