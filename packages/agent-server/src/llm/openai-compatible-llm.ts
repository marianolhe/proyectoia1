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
}

type Json = Record<string, unknown>

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toWireMessages(system: string, messages: readonly LlmMessage[]): Json[] {
  const wire: Json[] = [{ role: 'system', content: system }]
  for (const message of messages) {
    if (message.role === 'user') {
      wire.push({ role: 'user', content: message.content })
    } else if (message.role === 'assistant') {
      const toolCalls = (message.toolCalls ?? []).map((call) => ({
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

function errorFor(status: number): LlmError {
  if (status === 401 || status === 403) {
    return new LlmError('auth', 'La credencial del modelo no es valida.')
  }
  if (status === 429)
    return new LlmError('rate_limit', 'El proveedor limito la tasa de peticiones.')
  if (status >= 400 && status < 500) {
    return new LlmError('bad_request', `El proveedor rechazo la peticion (${status}).`)
  }
  return new LlmError('unavailable', `El proveedor respondio con un error (${status}).`)
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

  constructor(options: OpenAiCompatibleOptions) {
    this.#url = `${options.baseUrl.replace(/\/+$/, '')}/chat/completions`
    this.#apiKey = options.apiKey
    this.#model = options.model
    this.#post = options.post ?? ((url, init) => fetch(url, init))
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

    let response: Awaited<ReturnType<HttpPost>>
    try {
      response = await this.#post(this.#url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.#apiKey}`,
        },
        body: JSON.stringify(body),
      })
    } catch {
      throw new LlmError('unavailable', 'No se pudo contactar al proveedor del modelo.')
    }
    if (!response.ok) throw errorFor(response.status)

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

    return { text, toolCalls, stop }
  }
}
