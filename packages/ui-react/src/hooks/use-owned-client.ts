import { ChatClient, type ChatTransport } from '@agichat/core'
import { useEffect, useState } from 'react'

/**
 * Crea, conecta y destruye un ChatClient alrededor del transporte inyectado.
 *
 * El cliente nace dentro del efecto y no en el render: React en modo estricto
 * monta, desmonta y vuelve a montar, y `destroy` cierra el transporte y le
 * quita los oyentes. Si el cliente se creara una sola vez fuera del efecto, el
 * segundo montaje quedaria con un cliente destruido y un widget mudo.
 */
export function useOwnedClient(transport: ChatTransport | null): ChatClient | null {
  const [client, setClient] = useState<ChatClient | null>(null)

  useEffect(() => {
    if (transport === null) return

    const next = new ChatClient({ transport })
    setClient(next)
    // Un fallo al conectar ya llega como evento `status` por el flujo del
    // transporte, que es donde la interfaz lo muestra; aqui solo se evita un
    // rechazo no capturado.
    next.connect().catch(() => {})

    return () => {
      next.destroy()
      setClient((current) => (current === next ? null : current))
    }
  }, [transport])

  return client
}
