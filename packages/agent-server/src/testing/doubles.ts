import type { AgentEvent } from '@agichat/core'
import type { LlmClient, LlmRequest, LlmResponse, LlmToolSpec } from '../ports/llm.js'
import type { ToolCallOutcome, ToolGateway } from '../ports/tool-gateway.js'

/** Dobles de prueba del modelo y de las herramientas para este paquete. */

export function scriptedLlm(responses: readonly LlmResponse[]) {
  const requests: LlmRequest[] = []
  let index = 0
  const llm: LlmClient = {
    complete: (request) => {
      // Se copia la lista: el orquestador la sigue modificando despues.
      requests.push({ ...request, messages: [...request.messages] })
      const response = responses[Math.min(index, responses.length - 1)]
      index += 1
      return response === undefined
        ? Promise.reject(new Error('guion vacio'))
        : Promise.resolve(response)
    },
  }
  return { llm, requests }
}

export const text = (value: string): LlmResponse => ({ text: value, toolCalls: [], stop: 'end' })

export const toolUse = (
  name: string,
  input: Record<string, unknown> = {},
  id = 'c1',
): LlmResponse => ({
  text: '',
  toolCalls: [{ id, name, input }],
  stop: 'tool_use',
})

export const TOOL_SPECS: readonly LlmToolSpec[] = [
  { name: 'tmdb_show_poster', description: 'poster', inputSchema: { type: 'object' } },
  { name: 'tmdb_open_imdb', description: 'imdb', inputSchema: { type: 'object' } },
  { name: 'tmdb_search_movies', description: 'buscar', inputSchema: { type: 'object' } },
]

export function fakeGateway(outcomes: Record<string, ToolCallOutcome> = {}) {
  const calls: { name: string; args: Record<string, unknown> }[] = []
  const gateway: ToolGateway = {
    listTools: () => Promise.resolve(TOOL_SPECS),
    callTool: (name, args) => {
      calls.push({ name, args })
      return Promise.resolve(outcomes[name] ?? { ok: true, payload: { name }, ui: [] })
    },
    close: () => Promise.resolve(),
  }
  return { gateway, calls }
}

export function collect() {
  const events: AgentEvent[] = []
  return {
    events,
    emit: (event: AgentEvent) => events.push(event),
    text: () =>
      events
        .filter((event) => event.type === 'message.delta')
        .map((event) => event.text)
        .join(''),
  }
}
