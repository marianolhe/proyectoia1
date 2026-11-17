import Anthropic from '@anthropic-ai/sdk'
import {
  LlmError,
  type LlmClient,
  type LlmMessage,
  type LlmRequest,
  type LlmResponse,
  type LlmStop,
  type LlmToolCall,
} from '../ports/llm.js'

/**
 * Adaptador de Claude sobre el SDK oficial de Anthropic.
 *
 * La llamada no usa streaming a proposito: la respuesta completa pasa por la
 * revision de salida antes de enviarse al widget (ver output-guard). El
 * "streaming" que ve el usuario lo produce el backend al trocear un texto ya
 * revisado.
 */

type BetaMessage = Anthropic.Beta.BetaMessage
type BetaMessageParam = Anthropic.Beta.BetaMessageParam
type CreateParams = Anthropic.Beta.MessageCreateParamsNonStreaming

/** Lo unico que el adaptador usa del SDK; permite inyectar un doble en pruebas. */
export interface AnthropicMessagesApi {
  create(params: CreateParams): Promise<BetaMessage>
}

export interface AnthropicLlmOptions {
  readonly model?: string
  readonly effort?: 'low' | 'medium' | 'high'
  readonly maxTokens?: number
  /** Por defecto, el cliente del SDK con las credenciales del entorno. */
  readonly api?: AnthropicMessagesApi
}

export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5'

const FALLBACK_BETA = 'server-side-fallback-2026-07-01'

/**
 * Modelos cuyos clasificadores de seguridad pueden declinar una peticion y
 * que aceptan el parametro `fallbacks`: ante un rechazo, la API reintenta en
 * el modelo de respaldo dentro de la misma llamada.
 */
const MODELS_WITH_FALLBACK = new Set([
  'claude-fable-5-2',
  'claude-fable-5-1',
  'claude-opus-5-5',
  'claude-opus-5',
  'claude-sonnet-5-5',
])

function toAnthropicMessage(message: LlmMessage): BetaMessageParam {
  if (message.role === 'user') return { role: 'user', content: message.content }

  if (message.role === 'tool') {
    return {
      role: 'user',
      content: message.results.map((result) => ({
        type: 'tool_result' as const,
        tool_use_id: result.toolCallId,
        content: result.content,
        is_error: result.isError,
      })),
    }
  }

  // Dentro del ciclo de herramientas se devuelve el contenido original, sin
  // tocar: el modelo necesita sus propios bloques de razonamiento intactos.
  if (message.providerState !== undefined) {
    return {
      role: 'assistant',
      content: message.providerState as Anthropic.Beta.BetaContentBlockParam[],
    }
  }
  return { role: 'assistant', content: message.content }
}

function toStop(reason: BetaMessage['stop_reason']): LlmStop {
  if (reason === 'tool_use') return 'tool_use'
  if (reason === 'max_tokens') return 'max_tokens'
  if (reason === 'refusal') return 'refusal'
  return 'end'
}

function toLlmError(error: unknown): LlmError {
  if (error instanceof Anthropic.AuthenticationError) {
    return new LlmError('auth', 'La credencial de Anthropic no es valida.')
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return new LlmError('auth', 'La credencial de Anthropic no tiene acceso a este modelo.')
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new LlmError('rate_limit', 'Anthropic limito la tasa de peticiones.')
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new LlmError('bad_request', `Anthropic rechazo la peticion: ${error.message}`)
  }
  if (error instanceof Anthropic.APIError) {
    return new LlmError('unavailable', `Anthropic respondio con un error (${error.status}).`)
  }
  return new LlmError('unavailable', 'No se pudo contactar a Anthropic.')
}

export class AnthropicLlm implements LlmClient {
  readonly #api: AnthropicMessagesApi
  readonly #model: string
  readonly #effort: 'low' | 'medium' | 'high'
  readonly #maxTokens: number

  constructor(options: AnthropicLlmOptions = {}) {
    this.#api = options.api ?? new Anthropic().beta.messages
    this.#model = options.model ?? DEFAULT_ANTHROPIC_MODEL
    this.#effort = options.effort ?? 'medium'
    this.#maxTokens = options.maxTokens ?? 16000
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const withFallback = MODELS_WITH_FALLBACK.has(this.#model)

    let response: BetaMessage
    try {
      response = await this.#api.create({
        model: this.#model,
        max_tokens: this.#maxTokens,
        system: request.system,
        messages: request.messages.map(toAnthropicMessage),
        tools: request.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema as Anthropic.Beta.BetaTool['input_schema'],
        })),
        output_config: { effort: this.#effort },
        ...(withFallback ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {}),
      })
    } catch (error) {
      throw toLlmError(error)
    }

    const text: string[] = []
    const toolCalls: LlmToolCall[] = []
    for (const block of response.content) {
      if (block.type === 'text') text.push(block.text)
      if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: (block.input ?? {}) as Record<string, unknown>,
        })
      }
    }

    return {
      text: text.join(''),
      toolCalls,
      stop: toStop(response.stop_reason),
      providerState: response.content,
    }
  }
}
