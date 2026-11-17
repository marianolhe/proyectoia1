import type { AgentEvent, HistoryEntry, OutboundMessage } from '@agichat/core'
import {
  IMAGE_HOSTS,
  LINK_HOSTS,
  OPEN_URL_HOSTS,
  inspectOutput,
  inspectUserInput,
  isAllowedUrl,
  sanitizeMarkdownUrls,
  sanitizeUntrusted,
  wrapUntrusted,
  type InputCategory,
} from '@agichat/guardrails'
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
 * ReAct) y concentra las defensas, en este orden:
 *
 *   entrada -> [filtro de entrada] -> modelo <-> herramientas MCP
 *           -> [saneo de datos externos] -> [lista blanca de URLs]
 *           -> [revision de salida] -> widget
 *
 * Es una funcion sin estado: todo lo que necesita llega en el mensaje (texto
 * e historial) y en `deps`. Por eso cualquier replica puede atender cualquier
 * turno.
 */

export type SecurityEvent =
  | {
      readonly type: 'input_blocked'
      readonly category: InputCategory
      readonly rules: readonly string[]
    }
  | { readonly type: 'history_entry_dropped'; readonly category: InputCategory }
  | { readonly type: 'untrusted_data_flagged'; readonly tool: string; readonly count: number }
  | { readonly type: 'ui_directive_rejected'; readonly tool: string; readonly url: string }
  | { readonly type: 'markdown_url_removed'; readonly count: number }
  | { readonly type: 'output_blocked'; readonly category: string }
  | { readonly type: 'unknown_tool_requested'; readonly tool: string }

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
  readonly canary: string
  readonly secrets?: readonly string[]
  emit(event: AgentEvent): void
  wait(ms: number): Promise<void>
  /** Registro de eventos de seguridad. Nunca recibe el texto del usuario. */
  log?(event: SecurityEvent): void
  readonly limits?: Partial<AgentLimits>
  readonly timing?: Partial<StreamTiming>
}

const DEFAULT_LIMITS: AgentLimits = { maxSteps: 6, maxToolCalls: 10, maxImages: 3, maxOpenUrls: 2 }
const DEFAULT_TIMING: StreamTiming = { deltaDelayMs: 12, chunkSize: 28 }

export const REFUSALS: Record<InputCategory | 'leak' | 'model_refusal', string> = {
  prompt_injection:
    'No puedo cambiar mis reglas ni seguir ese tipo de instrucciones. Con gusto te recomiendo una película: ¿qué género te apetece?',
  prompt_extraction:
    'No puedo compartir mis instrucciones internas ni datos de configuración. Lo que sí puedo es recomendarte una película o compararla con su libro.',
  too_long: 'Tu mensaje es demasiado largo. ¿Podrías resumirlo en unas pocas líneas?',
  empty: 'No recibí ningún texto. ¿Qué película te interesa?',
  leak: 'No puedo responder a eso. ¿Te ayudo a encontrar una película?',
  model_refusal: 'No puedo ayudarte con eso. ¿Te recomiendo una película?',
}

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

/**
 * Descarta del historial los mensajes del usuario que el filtro bloquearia
 * hoy, junto con la respuesta que les siguio. Sin esto, un ataque rechazado en
 * el turno anterior volveria a entrar al modelo como "contexto".
 */
export function sanitizeHistory(
  history: readonly HistoryEntry[],
  log: (event: SecurityEvent) => void,
): LlmMessage[] {
  const messages: LlmMessage[] = []
  let skipNextAssistant = false

  for (const entry of history) {
    if (entry.role === 'user') {
      const verdict = inspectUserInput(entry.content, { maxLength: 4000 })
      skipNextAssistant = !verdict.allowed
      if (verdict.allowed) messages.push({ role: 'user', content: verdict.text })
      else log({ type: 'history_entry_dropped', category: verdict.category })
    } else {
      if (!skipNextAssistant) messages.push({ role: 'assistant', content: entry.content })
      skipNextAssistant = false
    }
  }

  // Los proveedores exigen que la conversacion empiece con el usuario.
  while (messages[0] !== undefined && messages[0].role !== 'user') messages.shift()
  return messages
}

function acceptDirective(directive: UiDirective): boolean {
  return directive.type === 'image'
    ? isAllowedUrl(directive.url, IMAGE_HOSTS)
    : isAllowedUrl(directive.url, OPEN_URL_HOSTS)
}

async function executeToolCall(
  call: LlmToolCall,
  known: ReadonlySet<string>,
  deps: AgentDeps,
  log: (event: SecurityEvent) => void,
  collected: UiDirective[],
): Promise<LlmToolResult> {
  if (!known.has(call.name)) {
    log({ type: 'unknown_tool_requested', tool: call.name })
    return {
      toolCallId: call.id,
      name: call.name,
      content: wrapUntrusted(call.name, { error: 'Esa herramienta no existe.' }),
      isError: true,
    }
  }

  const outcome = await deps.tools.callTool(call.name, call.input)

  for (const directive of outcome.ui) {
    if (acceptDirective(directive)) collected.push(directive)
    else log({ type: 'ui_directive_rejected', tool: call.name, url: directive.url })
  }

  const sanitized = sanitizeUntrusted(outcome.payload)
  if (sanitized.flagged > 0) {
    log({ type: 'untrusted_data_flagged', tool: call.name, count: sanitized.flagged })
  }

  return {
    toolCallId: call.id,
    name: call.name,
    content: wrapUntrusted(call.name, sanitized.value),
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
  log: (event: SecurityEvent) => void,
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
      response.toolCalls.map((call) => executeToolCall(call, known, deps, log, directives)),
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
  const log = deps.log ?? (() => {})
  const replyId = `${message.messageId}-reply`
  const plain = (text: string): TurnOutput => ({ text, images: [], openUrls: [] })

  const verdict = inspectUserInput(message.text)
  if (!verdict.allowed) {
    log({ type: 'input_blocked', category: verdict.category, rules: verdict.matched })
    await streamReply(replyId, plain(REFUSALS[verdict.category]), deps, timing)
    return
  }

  const history = sanitizeHistory(message.history ?? [], log)
  const messages: LlmMessage[] = [...history, { role: 'user', content: verdict.text }]

  let output: TurnOutput
  try {
    const tools = await deps.tools.listTools()
    output = await think(messages, tools, deps, limits, log)
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

  const cleaned = sanitizeMarkdownUrls(output.text, {
    imageHosts: IMAGE_HOSTS,
    linkHosts: LINK_HOSTS,
  })
  if (cleaned.removed > 0) log({ type: 'markdown_url_removed', count: cleaned.removed })

  const outputVerdict = inspectOutput(cleaned.text, {
    canary: deps.canary,
    systemPrompt: deps.systemPrompt,
    ...(deps.secrets === undefined ? {} : { secrets: deps.secrets }),
  })
  if (!outputVerdict.allowed) {
    log({ type: 'output_blocked', category: outputVerdict.category })
    // Un turno comprometido no abre pestanias ni pinta imagenes.
    await streamReply(replyId, plain(REFUSALS.leak), deps, timing)
    return
  }

  const text = cleaned.text.trim().length === 0 ? REFUSALS.model_refusal : cleaned.text
  await streamReply(
    replyId,
    { ...output, text: withAnnouncement(text, history.length === 0) },
    deps,
    timing,
  )
}
