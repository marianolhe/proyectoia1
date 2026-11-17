import { ChatWidget, type AttributionInfo, type ChatLabels } from '@agichat/ui-react'
import { useMemo, useState } from 'react'
import { createTransport, defaultKind, type TransportKind } from './create-transport.js'

const WS_URL = import.meta.env.VITE_AGICHAT_WS_URL || undefined

const KIND_LABELS: Record<TransportKind, string> = {
  'in-browser': 'Agente simulado en el navegador (sin backend)',
  websocket: `Agente real (${WS_URL ?? 'sin URL configurada'})`,
}

/**
 * Logo oficial y aviso que exigen los terminos de uso de la API de TMDB para
 * el plan gratuito. Va en el pie del widget, visible en cada conversacion, y
 * mas pequenio que la marca del sitio, como pide su guia. El logo es el
 * "Alt short (blue)" de themoviedb.org/about/logos-attribution, servido desde
 * public/ para no depender de su CDN. BASE_URL respeta la ruta de Pages.
 */
export const TMDB_ATTRIBUTION: AttributionInfo = {
  text: 'Este producto usa la API de TMDB pero no está avalado ni certificado por TMDB.',
  href: 'https://www.themoviedb.org/',
  logoSrc: `${import.meta.env.BASE_URL}tmdb-logo.svg`,
  logoAlt: 'The Movie Database (TMDB)',
}

export const MOVIE_LABELS: Partial<ChatLabels> = {
  title: '¡Hola, soy Sofía, tu asistente de cine!',
  subtitle: 'Te recomiendo películas y las comparo con su libro',
  placeholder: 'Pídeme una película',
}

export function App() {
  const [kind, setKind] = useState<TransportKind>(defaultKind(WS_URL))
  // Un transporte por eleccion: cambiarlo remonta el widget con el nuevo
  // adaptador, sin tocar un solo componente.
  const transport = useMemo(() => createTransport(kind, WS_URL), [kind])

  return (
    <main className="demo">
      <section className="demo__intro">
        <h1>AGIChat · Sofía, asistente de cine</h1>
        <p>
          El mismo widget del proyecto 1, ahora conectado a un agente que recomienda películas con
          datos de The Movie Database, las compara con su libro en Google Books y abre IMDb o Google
          Books en una pestaña nueva.
        </p>
        <fieldset className="demo__transports">
          <legend>Transporte</legend>
          {(Object.keys(KIND_LABELS) as TransportKind[]).map((option) => (
            <label key={option}>
              <input
                type="radio"
                name="transport"
                value={option}
                checked={kind === option}
                disabled={option === 'websocket' && WS_URL === undefined}
                onChange={() => setKind(option)}
              />
              {KIND_LABELS[option]}
            </label>
          ))}
        </fieldset>
        <p className="demo__hint">
          Pruebe: &quot;recomiéndame una película de ciencia ficción&quot;, &quot;¿vale la pena ver
          Dune o mejor leo el libro?&quot; o &quot;ábreme IMDb de esa película&quot;. Para que las
          pestañas se abran solas, permita las ventanas emergentes de este sitio.
        </p>
      </section>
      <ChatWidget
        key={kind}
        transport={transport}
        launcher={false}
        className="demo__widget"
        labels={MOVIE_LABELS}
        attribution={TMDB_ATTRIBUTION}
      />
    </main>
  )
}
