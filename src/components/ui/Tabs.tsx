import { useRef, type KeyboardEvent } from 'react'

export function Tabs<T extends string>({ value, tabs, onChange, label = 'View options' }: {
  value: T
  tabs: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  label?: string
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % tabs.length
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = tabs.length - 1
    else return
    event.preventDefault()
    onChange(tabs[next].value)
    refs.current[next]?.focus()
  }

  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((tab, index) => (
        <button
          type="button"
          key={tab.value}
          ref={(element) => { refs.current[index] = element }}
          className={value === tab.value ? 'is-active' : ''}
          role="tab"
          aria-selected={value === tab.value}
          tabIndex={value === tab.value ? 0 : -1}
          onKeyDown={(event) => move(event, index)}
          onClick={() => onChange(tab.value)}
        >{tab.label}</button>
      ))}
    </div>
  )
}
