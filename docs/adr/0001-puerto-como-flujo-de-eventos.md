# ADR 0001: el puerto `ChatTransport` es un flujo de eventos

- **Estado:** aceptada
- **Código:** `packages/core/src/ports/transport.ts`, `packages/core/src/chat-client.ts`

## Contexto

El widget debe hablar hoy con un agente simulado y en la Fase 2 con el agente real, sin rehacer la interfaz. La respuesta de un agente no es un valor único: llega por partes, tarda y puede fallar a la mitad. Además, el canal puede caerse y reconectarse en cualquier momento.

## Decisión

El núcleo define un puerto `ChatTransport` con `connect()`, `send()`, `subscribe(listener)` y `disconnect()`. Todo lo que el adaptador produce (estado del canal, `message.start`, `message.delta`, `message.end`, `error`) llega por **un solo flujo** de eventos `TransportEvent`. La interfaz recibe el adaptador por inyección y nunca lo construye.

## Alternativas consideradas

| Alternativa                                            | Por qué se descartó                                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `send(text): Promise<string>`                          | No representa el streaming; al llegar el agente real habría que rediseñar la interfaz |
| Callbacks separados (`onDelta`, `onStatus`, `onError`) | No garantizan el orden relativo entre un cambio de conexión y un fragmento de texto   |
| Observables (RxJS)                                     | Agregan una dependencia de runtime al núcleo, que debe quedar en cero                 |

## Consecuencias

- El cambio a la Fase 2 se reduce a otro adaptador: `WebSocketTransport` apuntado a otra URL, o un paquete `transport-*` nuevo.
- Hoy existen tres implementaciones intercambiables: `InMemoryTransport`, `WebSocketTransport` e `InBrowserMockTransport`. Eso prueba que el contrato es sustituible.
- Cada adaptador debe validar las tramas entrantes (`parse-agent-event.ts`), porque el contrato no se puede imponer al otro lado del cable.
- `sendMessage` devuelve un `SendResult` en lugar de lanzar, porque lo llama un manejador de eventos de React.

## Rol de la IA

- **Qué propuso el agente:** [COMPLETAR POR EL EQUIPO]
- **Qué decidió el equipo y por qué:** [COMPLETAR POR EL EQUIPO]
