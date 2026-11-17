import type { AgentEvent, HistoryEntry } from '@agichat/core'
import {
  McpToolGateway,
  buildSystemPrompt,
  inMemoryConnector,
  runAgentTurn,
  type LlmClient,
  type SecurityEvent,
  type ToolGateway,
} from '@agichat/agent-server'
import { createBooksServerFactory } from '@agichat/mcp-books'
import { createTmdbServerFactory } from '@agichat/mcp-tmdb'
import { createFakeApis } from './fixtures/fake-apis.js'

/**
 * Banco de pruebas de un turno.
 *
 * Ejecuta el agente real (`runAgentTurn`) con los MCP Servers reales
 * conectados en memoria y registra todo lo observable: lo que saldria hacia el
 * widget, las herramientas que se llamaron y los eventos de seguridad. Los
 * evals se escriben contra esa traza y no contra detalles internos.
 */

/** Canario fijo: los evals necesitan saber que cadena buscar. */
export const EVAL_CANARY = 'AGC-0123456789abcdef01234567'
/** Secreto falso que simula una clave del proceso. */
export const EVAL_SECRET = 'sk-eval-0000000000000000000000000000'

export interface ToolCallRecord {
  readonly name: string
  readonly input: Record<string, unknown>
  readonly ok: boolean
}

export interface TurnTrace {
  readonly events: readonly AgentEvent[]
  /** Texto completo que veria el usuario. */
  readonly text: string
  readonly images: readonly string[]
  readonly openedUrls: readonly string[]
  readonly toolCalls: readonly ToolCallRecord[]
  readonly securityEvents: readonly SecurityEvent[]
  readonly llmCalls: number
  readonly systemPrompt: string
  readonly canary: string
}

export interface TurnInput {
  readonly text: string
  readonly history?: readonly HistoryEntry[]
}

function recordingGateway(inner: ToolGateway, records: ToolCallRecord[]): ToolGateway {
  return {
    listTools: () => inner.listTools(),
    close: () => inner.close(),
    callTool: async (name, args) => {
      const outcome = await inner.callTool(name, args)
      records.push({ name, input: args, ok: outcome.ok })
      return outcome
    },
  }
}

export function createEvalGateway(): ToolGateway {
  const apis = createFakeApis()
  return new McpToolGateway({
    connectors: [
      inMemoryConnector('tmdb', createTmdbServerFactory({ apiKey: 'eval-key' }, apis.fetch)),
      inMemoryConnector('books', createBooksServerFactory({}, apis.fetch)),
    ],
  })
}

export async function runTurn(
  input: TurnInput,
  createLlm: (systemPrompt: string) => LlmClient,
): Promise<TurnTrace> {
  const systemPrompt = buildSystemPrompt(EVAL_CANARY)
  const events: AgentEvent[] = []
  const toolCalls: ToolCallRecord[] = []
  const securityEvents: SecurityEvent[] = []
  let llmCalls = 0

  const llm = createLlm(systemPrompt)
  const gateway = createEvalGateway()

  try {
    await runAgentTurn(
      {
        conversationId: 'eval',
        messageId: 'm1',
        text: input.text,
        ...(input.history === undefined ? {} : { history: input.history }),
      },
      {
        llm: {
          complete: (request) => {
            llmCalls += 1
            return llm.complete(request)
          },
        },
        tools: recordingGateway(gateway, toolCalls),
        systemPrompt,
        canary: EVAL_CANARY,
        secrets: [EVAL_SECRET],
        emit: (event) => events.push(event),
        wait: () => Promise.resolve(),
        log: (event) => securityEvents.push(event),
        timing: { deltaDelayMs: 0 },
      },
    )
  } finally {
    await gateway.close()
  }

  return {
    events,
    text: events
      .filter((event) => event.type === 'message.delta')
      .map((event) => event.text)
      .join(''),
    images: events.filter((event) => event.type === 'message.image').map((event) => event.url),
    openedUrls: events
      .filter((event) => event.type === 'action.open_url')
      .map((event) => event.url),
    toolCalls,
    securityEvents,
    llmCalls,
    systemPrompt,
    canary: EVAL_CANARY,
  }
}
