/**
 * Tipos del dominio de la conversacion.
 *
 * Este archivo no conoce React, WebSockets ni el DOM. Describe unicamente que
 * es un mensaje dentro de una conversacion con un agente, de modo que la misma
 * definicion sirva para la interfaz, para los adaptadores y para las pruebas.
 */

/** Quien emitio el mensaje. */
export type MessageRole = 'user' | 'assistant'

/**
 * Ciclo de vida de un mensaje.
 *
 * Un mensaje del usuario nace completo. Uno del agente nace vacio en estado
 * `streaming` y se va llenando token a token hasta `complete`, o queda en
 * `error` si la conexion se corta a medio camino conservando lo ya recibido.
 */
export type MessageStatus = 'streaming' | 'complete' | 'error'

/** Imagen adjunta a un mensaje del agente. */
export interface MessageImage {
  readonly url: string
  readonly alt: string
}

export interface Message {
  readonly id: string
  readonly role: MessageRole
  /** Texto en Markdown. La sanitizacion ocurre al renderizar, no aqui. */
  readonly content: string
  readonly images?: readonly MessageImage[]
  readonly status: MessageStatus
  readonly createdAt: number
}

/**
 * Fase de la conversacion, independiente del estado de la conexion.
 *
 * Se mantienen separadas a proposito: una conexion abierta no implica que el
 * agente este respondiendo, y un corte de red no debe borrar la conversacion.
 */
export type ConversationPhase = 'idle' | 'sending' | 'streaming'

/**
 * Resultado de intentar abrir una pestania. "blocked" cubre tanto el bloqueo
 * de ventanas emergentes del navegador como un destino fuera de la lista
 * permitida; en ambos casos la interfaz ofrece el enlace para abrirlo a mano.
 */
export type AgentActionStatus = 'pending' | 'opened' | 'blocked'

/** Accion que el agente pide ejecutar en el navegador del usuario. */
export interface AgentAction {
  readonly id: string
  readonly type: 'open_url'
  readonly url: string
  readonly title: string
  readonly status: AgentActionStatus
}

export interface ConversationError {
  readonly code: string
  readonly message: string
  /** Si es recuperable, la interfaz puede ofrecer reintentar sin recargar. */
  readonly recoverable: boolean
}
