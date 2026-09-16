import type { PlatformCompatibility } from '../../services/platformCompatibility'

export function CompatibilityState({ report }: { report: PlatformCompatibility }) {
  return (
    <main className="fatal-state fatal-state--recovery" id="main-content">
      <div>
        <div className="kicker">Browser compatibility</div>
        <h1>This browser is missing required local-first capabilities.</h1>
        <p>The planner will not open the database when core platform primitives are unavailable. This avoids partial or unpredictable operation.</p>
        <ul className="compatibility-list">
          {report.missing.map((item) => <li key={item}>{item}</li>)}
        </ul>
        <p>Use a current version of Chrome, Edge, Firefox, or Safari with IndexedDB and Web Crypto enabled.</p>
      </div>
    </main>
  )
}
