import { ChatWidget } from '@agichat/ui-react'
import { useMemo, useState } from 'react'
import { createTransport, defaultKind, type TransportKind } from './create-transport.js'

const WS_URL = import.meta.env.VITE_AGICHAT_WS_URL || undefined

const KIND_LABELS: Record<TransportKind, string> = {
  'in-browser': 'Agente simulado en el navegador',
  websocket: `Servidor WebSocket (${WS_URL ?? 'sin URL configurada'})`,
}

export function App() {
  const [kind, setKind] = useState<TransportKind>(defaultKind(WS_URL))
  // Un transporte por eleccion: cambiarlo remonta el widget con el nuevo
  // adaptador, sin tocar un solo componente.
  const transport = useMemo(() => createTransport(kind, WS_URL), [kind])

  return (
    <main className="demo">
      <section className="demo__intro">
        <h1>AGIChat SDK</h1>
        <p>
          Widget de chat agentico conectado por un puerto <code>ChatTransport</code>. Elija el
          adaptador; la interfaz no cambia.
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
          Pruebe: una pregunta cualquiera (Markdown con tabla y codigo), &quot;muestrame html&quot;
          (contenido malicioso sanitizado) o &quot;simula un error&quot;.
        </p>
      </section>
      <ChatWidget key={kind} transport={transport} launcher={false} className="demo__widget" />
    </main>
  )
}
