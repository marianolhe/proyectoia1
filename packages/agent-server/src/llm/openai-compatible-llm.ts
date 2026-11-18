import {
  LlmError,
  type LlmClient,
  type LlmMessage,
  type LlmRequest,
  type LlmResponse,
  type LlmToolCall,
} from '../ports/llm.js'

/**
 * Adaptador para proveedores que exponen el formato "chat completions"
 * (Gemini, Groq, Ollama, entre otros).
 *
 * Existe porque el enunciado pide usar planes gratuitos sin tarjeta: con este
 * adaptador el agente corre contra un modelo gratuito cambiando tres variables
 * de entorno, sin tocar el orquestador.
 */

export type HttpPost = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

export interface OpenAiCompatibleOptions {
  readonly baseUrl: string
  readonly apiKey: string
  readonly model: string
  readonly post?: HttpPost
  /**
   * Esperas antes de cada reintento ante 429 o 503. Los planes gratuitos
   * limitan las peticiones por minuto: esperar unos segundos suele bastar.
   */
  readonly retryDelaysMs?: readonly number[]
  readonly sleep?: (ms: number) => Promise<void>
}

const DEFAULT_RETRY_DELAYS_MS = [3000, 10000]
const RETRYABLE_STATUS = new Set([429, 503])

type Json = Record<string, unknown>

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Estado opaco que este adaptador guarda en `providerState`. */
interface WireState {
  readonly toolCalls: readonly Json[]
}

function rawToolCalls(state: unknown): readonly Json[] | null {
  if (!isObject(state) || !Array.isArray(state.toolCalls)) return null
  return (state as unknown as WireState).toolCalls
}

function toWireMessages(system: string, messages: readonly LlmMessage[]): Json[] {
  const wire: Json[] = [{ role: 'system', content: system }]
  for (const message of messages) {
    if (message.role === 'user') {
      wire.push({ role: 'user', content: message.content })
    } else if (message.role === 'assistant') {
      // Se reenvian las llamadas tal como las mando el proveedor: Gemini 3
      // adjunta una firma (`extra_content.google.thought_signature`) que exige
      // recibir de vuelta y que rechaza la peticion si falta.
      const original = rawToolCalls(message.providerState)
      const toolCalls =
        original ??
        (message.toolCalls ?? []).map((call) => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: JSON.stringify(call.input) },
        }))
      wire.push({
        role: 'assistant',
        content: message.content,
        ...(toolCalls.length === 0 ? {} : { tool_calls: toolCalls }),
      })
    } else {
      for (const result of message.results) {
        wire.push({ role: 'tool', tool_call_id: result.toolCallId, content: result.content })
      }
    }
  }
  return wire
}

function parseArguments(raw: unknown): Record<string, unknown> {
  if (isObject(raw)) return raw
  if (typeof raw !== 'string') return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    return isObject(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function parseToolCalls(raw: unknown): LlmToolCall[] {
  if (!Array.isArray(raw)) return []
  const calls: LlmToolCall[] = []
  raw.forEach((item, index) => {
    if (!isObject(item) || !isObject(item.function)) return
    const name = item.function.name
    if (typeof name !== 'string') return
    calls.push({
      id: typeof item.id === 'string' ? item.id : `call_${index}`,
      name,
      input: parseArguments(item.function.arguments),
    })
  })
  return calls
}

/**
 * Extrae el mensaje de error del proveedor. Gemini lo manda como lista
 * (`[{ error: { message } }]`) y los demas como objeto (`{ error: { message } }`).
 */
export function providerErrorMessage(body: unknown): string {
  const first: unknown = Array.isArray(body) ? body[0] : body
  if (!isObject(first) || !isObject(first.error)) return ''
  const message = first.error.message
  return typeof message === 'string' ? message.slice(0, 200) : ''
}

/** Gemini responde 400 (no 401) cuando la clave es invalida. */
const INVALID_KEY = /api[ _-]?key|credential|unauthori[sz]ed|permission/i

export function errorFor(status: number, providerMessage = ''): LlmError {
  const detail = providerMessage === '' ? '' : `: ${providerMessage}`
  if (status === 401 || status === 403 || INVALID_KEY.test(providerMessage)) {
    return new LlmError('auth', `La credencial del modelo no es valida (${status})${detail}`)
  }
  if (status === 429) {
    return new LlmError('rate_limit', `El proveedor limito la tasa de peticiones${detail}`)
  }
  if (status >= 400 && status < 500) {
    return new LlmError('bad_request', `El proveedor rechazo la peticion (${status})${detail}`)
  }
  return new LlmError('unavailable', `El proveedor respondio con un error (${status})${detail}`)
}

/**
 * Los MCP Servers publican JSON Schema completo, con `$schema`. Varias capas
 * "compatibles" (Gemini entre ellas) aceptan solo un subconjunto y rechazan
 * la peticion entera por ese campo, que no aporta nada al modelo.
 */
export function toProviderSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const { $schema: _dialect, ...rest } = schema
  return rest
}

export class OpenAiCompatibleLlm implements LlmClient {
  readonly #url: string
  readonly #apiKey: string
  readonly #model: string
  readonly #post: HttpPost
  readonly #retryDelaysMs: readonly number[]
  readonly #sleep: (ms: number) => Promise<void>

  constructor(options: OpenAiCompatibleOptions) {
    this.#url = `${options.baseUrl.replace(/\/+$/, '')}/chat/completions`
    this.#apiKey = options.apiKey
    this.#model = options.model
    this.#post = options.post ?? ((url, init) => fetch(url, init))
    this.#retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS
    this.#sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  }

  /** Envia la peticion y reintenta con espera si el proveedor esta saturado. */
  async #send(body: string): Promise<Awaited<ReturnType<HttpPost>>> {
    for (let attempt = 0; ; attempt += 1) {
      let response: Awaited<ReturnType<HttpPost>>
      try {
        response = await this.#post(this.#url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.#apiKey}`,
          },
          body,
        })
      } catch {
        throw new LlmError('unavailable', 'No se pudo contactar al proveedor del modelo.')
      }
      const delay = this.#retryDelaysMs[attempt]
      if (response.ok || !RETRYABLE_STATUS.has(response.status) || delay === undefined) {
        return response
      }
      await this.#sleep(delay)
    }
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const body = {
      model: this.#model,
      messages: toWireMessages(request.system, request.messages),
      ...(request.tools.length === 0
        ? {}
        : {
            tools: request.tools.map((tool) => ({
              type: 'function',
              function: {
                name: tool.name,
                description: tool.description,
                parameters: toProviderSchema(tool.inputSchema),
              },
            })),
          }),
    }

    const response = await this.#send(JSON.stringify(body))
    if (!response.ok) {
      let body: unknown = null
      try {
        body = await response.json()
      } catch {
        // Sin cuerpo legible se informa solo el estado.
      }
      throw errorFor(response.status, providerErrorMessage(body))
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new LlmError('unavailable', 'El proveedor devolvio una respuesta que no es JSON.')
    }

    const choice = isObject(payload) && Array.isArray(payload.choices) ? payload.choices[0] : null
    if (!isObject(choice) || !isObject(choice.message)) {
      throw new LlmError('unavailable', 'El proveedor devolvio una respuesta sin contenido.')
    }

    const toolCalls = parseToolCalls(choice.message.tool_calls)
    const text = typeof choice.message.content === 'string' ? choice.message.content : ''
    const stop =
      toolCalls.length > 0 ? 'tool_use' : choice.finish_reason === 'length' ? 'max_tokens' : 'end'

    if (toolCalls.length === 0) return { text, toolCalls, stop }
    const raw = (choice.message.tool_calls as unknown[]).filter(isObject)
    const providerState: WireState = { toolCalls: raw }
    return { text, toolCalls, stop, providerState }
  }
}
