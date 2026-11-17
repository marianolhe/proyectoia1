import type {
  LlmClient,
  LlmMessage,
  LlmRequest,
  LlmResponse,
  LlmToolCall,
} from '@agichat/agent-server'

/**
 * Modelos simulados para los evals sin conexion.
 *
 * Hay dos, y miden cosas distintas:
 *
 * - `scriptedLlm` sigue un guion de llamadas a herramientas. Verifica que la
 *   orquestacion funciona de punta a punta: protocolo MCP, datos, poster,
 *   pestanias y formato de eventos.
 * - `compromisedLlm` es el peor caso: un modelo que ya fue manipulado y hace
 *   exactamente lo que el atacante quiere. Verifica que las defensas del
 *   backend contienen el danio aunque el modelo falle por completo.
 *
 * Ninguno mide el criterio de un modelo real; para eso esta el modo `--live`.
 */

/** Lo que un paso del guion puede consultar de la conversacion. */
export interface ScriptContext {
  readonly request: LlmRequest
  /** Datos devueltos por la ultima llamada a esa herramienta, ya parseados. */
  result(toolName: string): Record<string, unknown>
}

export type ScriptStep = (context: ScriptContext) => LlmResponse

let callCounter = 0

export function callTools(
  ...calls: readonly { name: string; input: Record<string, unknown> }[]
): LlmResponse {
  const toolCalls: LlmToolCall[] = calls.map((call) => {
    callCounter += 1
    return { id: `call_${callCounter}`, name: call.name, input: call.input }
  })
  return { text: '', toolCalls, stop: 'tool_use' }
}

export function say(text: string): LlmResponse {
  return { text, toolCalls: [], stop: 'end' }
}

/** Extrae el JSON que el backend envolvio en <datos_externos>. */
export function unwrapToolContent(content: string): Record<string, unknown> {
  const match = /<datos_externos[^>]*>\n([\s\S]*)\n<\/datos_externos>/.exec(content)
  try {
    const parsed: unknown = JSON.parse(match?.[1] ?? '{}')
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function findResult(messages: readonly LlmMessage[], toolName: string): Record<string, unknown> {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role !== 'tool') continue
    const result = message.results.find((candidate) => candidate.name === toolName)
    if (result !== undefined) return unwrapToolContent(result.content)
  }
  return {}
}

export function scriptedLlm(steps: readonly ScriptStep[]): LlmClient {
  let index = 0
  return {
    complete: (request) => {
      const step = steps[index]
      index += 1
      if (step === undefined) return Promise.resolve(say('No tengo mas que agregar.'))
      return Promise.resolve(
        step({ request, result: (toolName) => findResult(request.messages, toolName) }),
      )
    },
  }
}

/**
 * Modelo ya comprometido. `attack` recibe la peticion completa (incluido el
 * system prompt, que un modelo real tambien "ve") y devuelve la respuesta mas
 * daniina posible para ese caso.
 */
export function compromisedLlm(
  attack: (request: LlmRequest, turn: number) => LlmResponse,
): LlmClient {
  let turn = 0
  return {
    complete: (request) => {
      const response = attack(request, turn)
      turn += 1
      return Promise.resolve(response)
    },
  }
}
