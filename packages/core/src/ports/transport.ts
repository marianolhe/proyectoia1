/**
 * Puerto de transporte: el contrato entre el SDK y el mundo exterior.
 *
 * Este archivo es la razon de ser de la arquitectura. El nucleo define QUE
 * necesita de un agente; ningun adaptador concreto aparece aqui. El servidor
 * mock de Fase 1 y el agente real de Fase 2 son dos implementaciones de esta
 * misma interfaz, asi que sustituir uno por otro no toca ni el nucleo ni la
 * interfaz: solo cambia el objeto que el integrador inyecta.
 *
 * Se modela como un flujo de eventos y no como una promesa de respuesta porque
 * una respuesta de agente no es un valor unico: llega por partes, puede fallar
 * a la mitad y puede tardar. Una promesa obligaria a rediseniar la interfaz en
 * cuanto apareciera el streaming real.
 */

/** Estado del canal de comunicacion, no de la conversacion. */
export type TransportStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed' | 'error'

/** Eventos que el agente produce mientras responde. */
export type AgentEvent =
  /** El agente empezo a componer una respuesta. */
  | { readonly type: 'message.start'; readonly messageId: string }
  /** Un fragmento de texto de esa respuesta. Los deltas se concatenan en orden. */
  | { readonly type: 'message.delta'; readonly messageId: string; readonly text: string }
  /**
   * Una imagen que acompania a esa respuesta (el poster de una pelicula). Va
   * como evento propio y no como Markdown dentro del texto para que la
   * interfaz decida como pintarla y pueda validar de donde viene.
   */
  | {
      readonly type: 'message.image'
      readonly messageId: string
      readonly url: string
      readonly alt: string
    }
  /** La respuesta termino y el mensaje queda completo. */
  | { readonly type: 'message.end'; readonly messageId: string }
  /**
   * El agente pide abrir una pagina en una pestania nueva, sin que el usuario
   * haga clic. La interfaz decide si el destino esta permitido.
   */
  | {
      readonly type: 'action.open_url'
      readonly actionId: string
      readonly url: string
      readonly title: string
    }
  /** Fallo del agente o del canal. */
  | {
      readonly type: 'error'
      readonly code: string
      readonly message: string
      readonly recoverable: boolean
    }

/** Cambio en el estado del canal, notificado por el mismo flujo. */
export interface TransportStatusEvent {
  readonly type: 'status'
  readonly status: TransportStatus
}

/**
 * Todo lo que un adaptador puede emitir.
 *
 * Un unico canal de suscripcion en vez de varios callbacks: garantiza que los
 * cambios de conexion y los fragmentos de texto lleguen en el orden real en que
 * ocurrieron, que es justo lo que una maquina de estados necesita.
 */
export type TransportEvent = AgentEvent | TransportStatusEvent

export type TransportListener = (event: TransportEvent) => void

export type Unsubscribe = () => void

/** Un turno anterior de la conversacion, tal como lo vio el usuario. */
export interface HistoryEntry {
  readonly role: 'user' | 'assistant'
  readonly content: string
}

/** Mensaje que el usuario envia hacia el agente. */
export interface OutboundMessage {
  readonly conversationId: string
  readonly messageId: string
  readonly text: string
  /**
   * Turnos anteriores. Viajan con cada mensaje para que el backend no tenga
   * que recordar nada entre peticiones: cualquier replica puede atender
   * cualquier mensaje, y reconectar no pierde el contexto.
   */
  readonly history?: readonly HistoryEntry[]
}

/**
 * Contrato que debe cumplir cualquier canal hacia un agente.
 *
 * Implementaciones: `InMemoryTransport` en este paquete (pruebas, sin red) y
 * `WebSocketTransport` en @agichat/transport-ws. En Fase 2 basta con apuntar
 * el adaptador WebSocket al backend real, o publicar un adaptador nuevo que
 * implemente esta interfaz.
 */
export interface ChatTransport {
  /** Estado actual del canal. Debe reflejarse tambien via eventos `status`. */
  readonly status: TransportStatus

  /** Abre el canal. Es idempotente: llamarlo con el canal abierto no hace nada. */
  connect(): Promise<void>

  /** Envia un mensaje del usuario. Rechaza si el canal no esta disponible. */
  send(message: OutboundMessage): Promise<void>

  /** Registra un oyente y devuelve la funcion para darlo de baja. */
  subscribe(listener: TransportListener): Unsubscribe

  /** Cierra el canal y libera recursos. Tambien idempotente. */
  disconnect(): void
}
