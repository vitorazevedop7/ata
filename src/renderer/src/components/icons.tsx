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

/** A page with written lines: stands for the summary ("a ata"). */
export function NoteIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg {...base} className={className}>
      <path d="M4 2.5h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z" />
      <path d="M5.5 6h5M5.5 8.5h5M5.5 11h3" />
    </svg>
  )
}

/** A pencil: renaming. */
export function PencilIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg {...base} className={className}>
      <path d="M10.5 3l2.5 2.5L6 12.5l-3.25.75L3.5 10z" />
      <path d="M9 4.5L11.5 7" />
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

export function ChevronDownIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg {...base} className={className}>
      <path d="M4 6l4 4 4-4" />
    </svg>
  )
}

/**
 * The app's mark: a stenographer's pad seen from above. The red rule splits the
 * page, with lines of speech on each side: "Outros" on the left, "Eu" on the right.
 */
export function BrandMark({ className }: IconProps): React.JSX.Element {
  return (
    // The app icon without its navy tile: here the sidebar is the ledger's cover.
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden className={className}>
      <rect x="3" y="1" width="16" height="20" rx="2.5" fill="var(--cover-ink)" />
      <path d="M11 1v20" stroke="var(--rec)" strokeWidth="1.25" />
      <path
        d="M5.5 5.5h3M6.5 8.5h2M13.5 11.5h3M13.5 14.5h2M6 17.5h2.5"
        stroke="var(--cover)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** An arrow dropping into a tray: bringing a file into the app. */
export function ImportIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg {...base} className={className}>
      <path d="M8 2.5v7M5 6.75L8 9.75l3-3" />
      <path d="M2.5 10.5v1.5a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5v-1.5" />
    </svg>
  )
}
