export function SegmentedControl<T extends string>({
  value, options, onChange, label = 'Options',
}: {
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  label?: string
}) {
  return (
    <div className="segmented-control" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          className={value === option.value ? 'is-active' : ''}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >{option.label}</button>
      ))}
    </div>
  )
}
