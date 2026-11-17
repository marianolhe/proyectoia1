/**
 * Atribucion de una fuente de datos.
 *
 * Los terminos de uso de la API de TMDB exigen identificar el uso de la API
 * con su logo o con el aviso de atribucion. El widget no conoce a TMDB: pinta
 * la atribucion que el integrador le pase, y sirve igual para otra fuente.
 */
export interface AttributionInfo {
  readonly text: string
  readonly href?: string
  readonly logoSrc?: string
  readonly logoAlt?: string
}

export interface AttributionProps {
  readonly attribution: AttributionInfo
}

export function Attribution({ attribution }: AttributionProps) {
  const { text, href, logoSrc, logoAlt } = attribution

  const logo =
    logoSrc === undefined ? null : (
      <img className="agc-attribution__logo" src={logoSrc} alt={logoAlt ?? ''} />
    )

  return (
    <footer className="agc-attribution">
      {href === undefined ? (
        logo
      ) : (
        <a
          className="agc-attribution__link"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          {...(logo === null ? {} : { 'aria-label': logoAlt ?? text })}
        >
          {logo ?? href.replace(/^https:\/\/(www\.)?/, '').replace(/\/$/, '')}
        </a>
      )}
      <span className="agc-attribution__text">{text}</span>
    </footer>
  )
}
