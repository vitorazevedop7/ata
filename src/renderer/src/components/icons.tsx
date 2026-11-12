type IconProps = { className?: string }

const base = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true
}

export function CopyIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg {...base} className={className}>
      <rect x="5.5" y="5.5" width="8" height="8" rx="2" />
      <path d="M10.5 5.5V4a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" />
    </svg>
  )
}

export function CheckIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg {...base} className={className}>
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  )
}

export function SparkleIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg {...base} className={className}>
      <path d="M8 2.5l1.3 3.2 3.2 1.3-3.2 1.3L8 11.5 6.7 8.3 3.5 7l3.2-1.3z" />
      <path d="M12.5 11.5l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5z" />
    </svg>
  )
}

export function TrashIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg {...base} className={className}>
      <path d="M2.5 4.5h11M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M4 4.5l.6 8.1a1.5 1.5 0 0 0 1.5 1.4h3.8a1.5 1.5 0 0 0 1.5-1.4l.6-8.1" />
    </svg>
  )
}

export function FolderIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg {...base} className={className}>
      <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6l1.4 1.5h5A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5z" />
    </svg>
  )
}

export function ChevronLeftIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg {...base} className={className}>
      <path d="M10 3L5 8l5 5" />
    </svg>
  )
}

export function WaveIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg {...base} className={className}>
      <path d="M2.5 8h1M5.5 5v6M8 3v10M10.5 5.5v5M13 7.5v1" />
    </svg>
  )
}
