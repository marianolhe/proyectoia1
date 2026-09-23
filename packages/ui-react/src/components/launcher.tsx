export interface LauncherProps {
  readonly open: boolean
  readonly controls: string
  readonly openLabel: string
  readonly closeLabel: string
  onToggle(): void
}

/** Burbuja flotante que abre y cierra el panel. */
export function Launcher({ open, controls, openLabel, closeLabel, onToggle }: LauncherProps) {
  return (
    <button
      className="agc-launcher"
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      aria-label={open ? closeLabel : openLabel}
      onClick={onToggle}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        {open ? (
          <path
            d="M6 6l12 12M18 6L6 18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        ) : (
          <path
            d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4h0A1.5 1.5 0 0 1 4 14.5Z"
            fill="currentColor"
          />
        )}
      </svg>
    </button>
  )
}
