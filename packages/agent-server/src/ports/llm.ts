/**
 * Puerto del modelo de lenguaje.
 *
 * El orquestador habla con "un modelo que puede pedir herramientas", no con un
 * proveedor. Cada proveedor es un adaptador de esta interfaz, igual que cada
 * canal es un adaptador de `ChatTransport` en el SDK. Cambiar de proveedor es
 * una variable de entorno, y las pruebas y los evals usan un modelo guionizado
 * que cumple el mismo contrato.
 */

export interface LlmToolSpec {
  readonly name: string
  readonly description: string
  /** JSON Schema de los argumentos, tal como lo publica el MCP Server. */
  readonly inputSchema: Record<string, unknown>
}

export interface LlmToolCall {
  readonly id: string
  readonly name: string
  readonly input: Record<string, unknown>
}

export interface LlmToolResult {
  readonly toolCallId: string
  readonly name: string
  readonly content: string
  readonly isError: boolean
}

export type LlmMessage =
  | { readonly role: 'user'; readonly content: string }
  | {
      readonly role: 'assistant'
      readonly content: string
      readonly toolCalls?: readonly LlmToolCall[]
      /**
       * Contenido original del proveedor para este turno. Algunos modelos
       * exigen recibir de vuelta sus bloques (por ejemplo los de razonamiento)
       * sin modificar mientras dura el ciclo de herramientas; el orquestador
       * lo guarda y lo devuelve sin mirarlo.
       */
      readonly providerState?: unknown
    }
  | { readonly role: 'tool'; readonly results: readonly LlmToolResult[] }

export interface LlmRequest {
  readonly system: string
  readonly messages: readonly LlmMessage[]
  readonly tools: readonly LlmToolSpec[]
}

export type LlmStop = 'end' | 'tool_use' | 'max_tokens' | 'refusal'

export interface LlmResponse {
  readonly text: string
  readonly toolCalls: readonly LlmToolCall[]
  readonly stop: LlmStop
  readonly providerState?: unknown
}

export interface LlmClient {
  complete(request: LlmRequest): Promise<LlmResponse>
}

export type LlmErrorKind = 'auth' | 'rate_limit' | 'bad_request' | 'unavailable'

/** Fallo del proveedor ya clasificado, para decidir que decirle al usuario. */
export class LlmError extends Error {
  readonly kind: LlmErrorKind

  constructor(kind: LlmErrorKind, message: string) {
    super(message)
    this.name = 'LlmError'
    this.kind = kind
  }
}
