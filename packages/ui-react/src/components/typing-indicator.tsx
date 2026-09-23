export interface TypingIndicatorProps {
  readonly label: string
}

/** Tres puntos animados mientras el agente aun no produce texto. */
export function TypingIndicator({ label }: TypingIndicatorProps) {
  return (
    <div className="agc-typing" role="status" aria-label={label}>
      <span className="agc-typing__dot" />
      <span className="agc-typing__dot" />
      <span className="agc-typing__dot" />
    </div>
  )
}
