import type { MessageImage } from '@agichat/core'
import { isAllowedUrl, usePolicy } from '../policy.js'

export interface MessageImagesProps {
  readonly images: readonly MessageImage[]
}

/**
 * Imagenes que el agente adjunta a su respuesta (el poster de la pelicula).
 * Solo se pintan las que vienen de un servidor de la lista permitida.
 */
export function MessageImages({ images }: MessageImagesProps) {
  const policy = usePolicy()
  const allowed = images.filter((image) => isAllowedUrl(image.url, policy.imageHosts))
  if (allowed.length === 0) return null

  return (
    <div className="agc-images">
      {allowed.map((image) => (
        <img
          key={image.url}
          className="agc-images__item"
          src={image.url}
          alt={image.alt}
          loading="lazy"
          // La URL de la pagina del cliente no tiene por que viajar al
          // servidor de imagenes.
          referrerPolicy="no-referrer"
        />
      ))}
    </div>
  )
}
