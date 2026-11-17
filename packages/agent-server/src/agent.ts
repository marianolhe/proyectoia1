import type { AgentEvent, HistoryEntry, OutboundMessage } from '@agichat/core'
import {
  LlmError,
  type LlmClient,
  type LlmMessage,
  type LlmToolCall,
  type LlmToolResult,
  type LlmToolSpec,
} from './ports/llm.js'
import type { ToolGateway, UiDirective } from './ports/tool-gateway.js'
import { BOOK_COMPARISON_ANNOUNCEMENT } from './system-prompt.js'

/**
 * Orquestador: un turno completo de la conversacion.
 *
 * Es el unico agente del sistema. Decide que herramientas llamar (ciclo
 * ReAct): pide una respuesta al modelo, ejecuta las herramientas que pida,
 * le devuelve los resultados y repite hasta que conteste con texto.
 *
 * Es una funcion sin estado: todo lo que necesita llega en el mensaje (texto
 * e historial) y en `deps`. Por eso cualquier replica puede atender cualquier
 * turno.
 */

export interface AgentLimits {
  /** Idas y vueltas modelo-herramientas por turno (LLM10: consumo sin limite). */
  readonly maxSteps: number
  readonly maxToolCalls: number
  readonly maxImages: number
  readonly maxOpenUrls: number
}

export interface StreamTiming {
  readonly deltaDelayMs: number
  readonly chunkSize: number
}

export interface AgentDeps {
  readonly llm: LlmClient
  readonly tools: ToolGateway
  readonly systemPrompt: string
  emit(event: AgentEvent): void
  wait(ms: number): Promise<void>
  readonly limits?: Partial<AgentLimits>
  readonly timing?: Partial<StreamTiming>
}

const DEFAULT_LIMITS: AgentLimits = { maxSteps: 6, maxToolCalls: 10, maxImages: 3, maxOpenUrls: 2 }
const DEFAULT_TIMING: StreamTiming = { deltaDelayMs: 12, chunkSize: 28 }

export const REFUSALS = {
  model_refusal: 'No puedo ayudarte con eso. ¿Te recomiendo una película?',
} as const

const STEP_LIMIT_MESSAGE =
  'Necesité demasiados pasos para responder y prefiero no darte un dato a medias. ¿Podrías hacer la pregunta de forma más concreta?'

const LLM_ERROR_MESSAGES: Record<LlmError['kind'], string> = {
  auth: 'El asistente no está configurado correctamente. Avise al administrador del sitio.',
  rate_limit: 'El asistente está recibiendo muchas consultas. Intente de nuevo en un momento.',
  bad_request: 'No se pudo procesar el mensaje. Intente reformularlo.',
  unavailable: 'El asistente no está disponible en este momento. Intente de nuevo en un momento.',
}

interface TurnOutput {
  readonly text: string
  readonly images: readonly Extract<UiDirective, { type: 'image' }>[]
  readonly openUrls: readonly Extract<UiDirective, { type: 'open_url' }>[]
}

/** Convierte el historial del widget en mensajes para el modelo. */
export function toLlmHistory(history: readonly HistoryEntry[]): LlmMessage[] {
  const messages: LlmMessage[] = history.map((entry) => ({
    role: entry.role,
    content: entry.content,
  }))
  // Los proveedores exigen que la conversacion empiece con el usuario.
  while (messages[0] !== undefined && messages[0].role !== 'user') messages.shift()
  return messages
}

async function executeToolCall(
  call: LlmToolCall,
  known: ReadonlySet<string>,
  deps: AgentDeps,
  collected: UiDirective[],
): Promise<LlmToolResult> {
  if (!known.has(call.name)) {
    return {
      toolCallId: call.id,
      name: call.name,
      content: JSON.stringify({ error: 'Esa herramienta no existe.' }),
      isError: true,
    }
  }

  const outcome = await deps.tools.callTool(call.name, call.input)
  collected.push(...outcome.ui)

  return {
    toolCallId: call.id,
    name: call.name,
    content: JSON.stringify(outcome.payload),
    isError: !outcome.ok,
  }
}

function dedupeByUrl<T extends { readonly url: string }>(items: readonly T[], max: number): T[] {
  const seen = new Set<string>()
  const unique: T[] = []
  for (const item of items) {
    if (seen.has(item.url)) continue
    seen.add(item.url)
    unique.push(item)
  }
  return unique.slice(0, max)
}

async function think(
  messages: LlmMessage[],
  tools: readonly LlmToolSpec[],
  deps: AgentDeps,
  limits: AgentLimits,
): Promise<TurnOutput> {
  const known = new Set(tools.map((tool) => tool.name))
  const directives: UiDirective[] = []
  let toolCallsUsed = 0

  for (let step = 0; step < limits.maxSteps; step += 1) {
    const response = await deps.llm.complete({ system: deps.systemPrompt, messages, tools })

    if (response.stop === 'refusal')
      return { text: REFUSALS.model_refusal, images: [], openUrls: [] }

    if (response.toolCalls.length === 0) {
      return {
        text: response.text,
        images: dedupeByUrl(
          directives.filter((d) => d.type === 'image'),
          limits.maxImages,
        ),
        openUrls: dedupeByUrl(
          directives.filter((d) => d.type === 'open_url'),
          limits.maxOpenUrls,
        ),
      }
    }

    toolCallsUsed += response.toolCalls.length
    if (toolCallsUsed > limits.maxToolCalls) break

    messages.push({
      role: 'assistant',
      content: response.text,
      toolCalls: response.toolCalls,
      ...(response.providerState === undefined ? {} : { providerState: response.providerState }),
    })
    const results = await Promise.all(
      response.toolCalls.map((call) => executeToolCall(call, known, deps, directives)),
    )
    messages.push({ role: 'tool', results })
  }

  return { text: STEP_LIMIT_MESSAGE, images: [], openUrls: [] }
}

/** Parte el texto en fragmentos sin cortar palabras, para simular escritura. */
export function chunkText(text: string, chunkSize: number): string[] {
  const chunks: string[] = []
  let current = ''
  for (const piece of text.split(/(?<=\s)/)) {
    if (current.length > 0 && current.length + piece.length > chunkSize) {
      chunks.push(current)
      current = ''
    }
    current += piece
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}

async function streamReply(
  messageId: string,
  output: TurnOutput,
  deps: AgentDeps,
  timing: StreamTiming,
): Promise<void> {
  deps.emit({ type: 'message.start', messageId })
  for (const chunk of chunkText(output.text, timing.chunkSize)) {
    deps.emit({ type: 'message.delta', messageId, text: chunk })
    if (timing.deltaDelayMs > 0) await deps.wait(timing.deltaDelayMs)
  }
  for (const image of output.images) {
    deps.emit({ type: 'message.image', messageId, url: image.url, alt: image.alt })
  }
  deps.emit({ type: 'message.end', messageId })

  // Las pestanias se abren al final: primero el usuario lee por que se abren.
  output.openUrls.forEach((action, index) => {
    deps.emit({
      type: 'action.open_url',
      actionId: `${messageId}-open-${index}`,
      url: action.url,
      title: action.title,
    })
  })
}

function withAnnouncement(text: string, isFirstTurn: boolean): string {
  // Garantia determinista de un requisito del producto: el usuario se entera
  // de la comparacion con el libro aunque el modelo olvide mencionarla.
  if (!isFirstTurn || /\blibros?\b/i.test(text)) return text
  return `${text}\n\n${BOOK_COMPARISON_ANNOUNCEMENT}`
}

export async function runAgentTurn(message: OutboundMessage, deps: AgentDeps): Promise<void> {
  const limits = { ...DEFAULT_LIMITS, ...deps.limits }
  const timing = { ...DEFAULT_TIMING, ...deps.timing }
  const replyId = `${message.messageId}-reply`

  const history = toLlmHistory(message.history ?? [])
  const messages: LlmMessage[] = [...history, { role: 'user', content: message.text.trim() }]

  let output: TurnOutput
  try {
    const tools = await deps.tools.listTools()
    output = await think(messages, tools, deps, limits)
  } catch (error) {
    const kind = error instanceof LlmError ? error.kind : 'unavailable'
    deps.emit({
      type: 'error',
      code: `llm_${kind}`,
      message: LLM_ERROR_MESSAGES[kind],
      recoverable: kind !== 'auth',
    })
    return
  }

  const text = output.text.trim().length === 0 ? REFUSALS.model_refusal : output.text
  await streamReply(
    replyId,
    { ...output, text: withAnnouncement(text, history.length === 0) },
    deps,
    timing,
  )
}
