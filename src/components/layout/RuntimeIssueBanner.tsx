import { useEffect, useState } from 'react'
import { dismissRuntimeIssue, subscribeRuntimeIssues, type RuntimeIssue } from '../../services/runtimeIssueService'

export function RuntimeIssueBanner({ onOpenData }: { onOpenData: () => void }) {
  const [issue, setIssue] = useState<RuntimeIssue | null>(null)
  useEffect(() => subscribeRuntimeIssues(setIssue), [])
  if (!issue) return null
  return (
    <div className="runtime-issue-banner" role="alert">
      <div>
        <strong>Something unexpected happened.</strong>
        <span>{issue.message} Your local workspace was not reset.</span>
      </div>
      <button onClick={() => { dismissRuntimeIssue(); onOpenData() }}>Verify data</button>
      <button aria-label="Dismiss error message" onClick={dismissRuntimeIssue}>×</button>
    </div>
  )
}
