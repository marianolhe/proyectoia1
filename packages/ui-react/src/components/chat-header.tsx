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

/** Ilustracion vectorial incluida para no depender de un recurso externo. */
function DefaultAvatar() {
  return (
    <svg className="agc-avatar__image" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <circle cx="32" cy="32" r="32" fill="#e7ecfb" />
      <path d="M14 58c2-11 9-17 18-17s16 6 18 17a32 32 0 0 1-36 0Z" fill="#3b5bdb" />
      <circle cx="32" cy="27" r="12" fill="#f6c9a8" />
      <path d="M19 27c0-9 6-15 13-15s13 6 13 14c-4-1-9-4-11-8-3 5-9 8-15 9Z" fill="#2b2d42" />
      <circle cx="27.5" cy="29" r="1.6" fill="#2b2d42" />
      <circle cx="36.5" cy="29" r="1.6" fill="#2b2d42" />
      <path
        d="M28 34c2.4 2 5.6 2 8 0"
        fill="none"
        stroke="#2b2d42"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}
