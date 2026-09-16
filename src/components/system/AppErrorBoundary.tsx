import { Component, type ErrorInfo, type ReactNode } from 'react'
import { downloadSafetyBackup } from '../../services/storageSafetyService'
import { reportRuntimeIssue } from '../../services/runtimeIssueService'

interface Props { children: ReactNode }
interface State { error: Error | null; backupState: 'idle' | 'busy' | 'done' | 'failed' }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null, backupState: 'idle' }

  static getDerivedStateFromError(error: Error): State {
    return { error, backupState: 'idle' }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportRuntimeIssue('render', error, info.componentStack ?? undefined)
    console.error('Application render failed', error, info)
  }

  private exportBackup = async () => {
    this.setState({ backupState: 'busy' })
    try {
      await downloadSafetyBackup('folio-emergency')
      this.setState({ backupState: 'done' })
    } catch (error) {
      reportRuntimeIssue('recovery', error)
      this.setState({ backupState: 'failed' })
    }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="fatal-state fatal-state--recovery" id="main-content">
        <div>
          <div className="kicker">Application recovery</div>
          <h1>The interface hit an unexpected error.</h1>
          <p>Your planner database is stored separately in IndexedDB. A render failure does not automatically reset or delete it.</p>
          <div className="fatal-actions">
            <button onClick={() => window.location.reload()}>Reload application</button>
            <button onClick={() => void this.exportBackup()} disabled={this.state.backupState === 'busy'}>
              {this.state.backupState === 'busy' ? 'Exporting…' : 'Export emergency backup'}
            </button>
          </div>
          {this.state.backupState === 'done' ? <p role="status">Emergency backup downloaded.</p> : null}
          {this.state.backupState === 'failed' ? <p role="alert" className="fatal-message">The backup could not be created. Reload first; if the error persists, use the database recovery screen.</p> : null}
          <details>
            <summary>Technical details</summary>
            <pre>{this.state.error.message}</pre>
          </details>
        </div>
      </main>
    )
  }
}
