export interface ChatHeaderProps {
  readonly title: string
  readonly subtitle: string
  readonly assistantName: string
  /** Imagen propia del integrador; si falta se usa la ilustracion incluida. */
  readonly avatarSrc?: string
}

/**
 * Encabezado fijo del panel.
 *
 * No es un estado vacio: sigue visible con mensajes en pantalla, tal como
 * pide el wireframe, para que el usuario siempre sepa con quien habla.
 */
export function ChatHeader({ title, subtitle, assistantName, avatarSrc }: ChatHeaderProps) {
  return (
    <header className="agc-header">
      <div className="agc-avatar">
        {avatarSrc === undefined ? (
          <DefaultAvatar />
        ) : (
          <img className="agc-avatar__image" src={avatarSrc} alt={assistantName} />
        )}
      </div>
      <h2 className="agc-header__title">{title}</h2>
      <p className="agc-header__subtitle">{subtitle}</p>
    </header>
  )
}

/** Osito del wireframe, en vector para no depender de un recurso externo. */
function DefaultAvatar() {
  return (
    <svg className="agc-avatar__image" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <circle cx="17" cy="19" r="8" fill="currentColor" />
      <circle cx="47" cy="19" r="8" fill="currentColor" />
      <ellipse cx="32" cy="35" rx="19" ry="17" fill="currentColor" />
      <circle cx="25" cy="31" r="2.6" fill="var(--agc-bg)" />
      <circle cx="39" cy="31" r="2.6" fill="var(--agc-bg)" />
      <ellipse cx="32" cy="41" rx="8" ry="6" fill="var(--agc-bg)" />
      <path d="M29 38.5h6l-3 3.2Z" fill="currentColor" />
    </svg>
  )
}
