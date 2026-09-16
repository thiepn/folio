export function ProgressRing({ value, label, percent }: { value: string; label: string; percent: number }) {
  const normalized = Math.max(0, Math.min(100, percent))
  return (
    <div
      className="progress-ring"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(normalized)}
      aria-valuetext={value}
      style={{ '--progress': normalized } as React.CSSProperties}
    >
      <div className="progress-ring__inner" aria-hidden="true">
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </div>
  )
}
