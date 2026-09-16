import type { SVGProps } from 'react'

export type IconName =
  | 'home' | 'inbox' | 'calendar' | 'folder' | 'habit' | 'review'
  | 'settings' | 'search' | 'focus' | 'plus' | 'close' | 'more'
  | 'check' | 'clock' | 'chevronRight' | 'download'

const paths: Record<IconName, React.ReactNode> = {
  home: <><path d="M4 10.5 12 4l8 6.5v8.5a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z" /></>,
  inbox: <><path d="M4 6h16l1 8v5H3v-5z" /><path d="M3 14h5l1.5 2h5L16 14h5" /></>,
  calendar: <><rect x="4" y="5" width="16" height="15" rx="1" /><path d="M8 3v4M16 3v4M4 9h16" /></>,
  folder: <path d="M3 7h7l2 2h9v10H3z" />,
  habit: <><path d="M12 20a8 8 0 1 0-8-8" /><path d="m4 17 1-5 5 1" /></>,
  review: <path d="M5 20V10M12 20V4M19 20v-7" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.7-1L14.5 3h-5L9.1 6.1a8 8 0 0 0-1.7 1L5 6.1 3 9.5 5.1 11a7 7 0 0 0 0 2L3 14.5 5 18l2.4-1.1a8 8 0 0 0 1.7 1L9.5 21h5l.4-3.1a8 8 0 0 0 1.7-1L19 18l2-3.5-2.1-1.5a7 7 0 0 0 .1-1z" /></>,
  search: <><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></>,
  focus: <><path d="M8 4H4v4M16 4h4v4M20 16v4h-4M8 20H4v-4" /><circle cx="12" cy="12" r="3" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  clock: <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>,
  chevronRight: <path d="m9 5 7 7-7 7" />,
  download: <><path d="M12 3v12m0 0 4-4m-4 4-4-4" /><path d="M4 19h16" /></>,
}

export function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>{paths[name]}</svg>
}
