import type { AgentEvent } from '@agichat/core'
import type { FailureScenario } from './responses.js'

/**
 * Emision de eventos de agente, separada del socket.
 *
 * `emit` y `wait` se inyectan en lugar de usar `socket.send` y `setTimeout`
 * directamente, para poder probar la secuencia de streaming en milisegundos
 * sin abrir un puerto real ni depender de temporizadores de verdad.
 */

export interface TurnDeps {
  readonly emit: (event: AgentEvent) => void
  readonly wait: (ms: number) => Promise<void>
}

export interface TurnTiming {
  readonly startDelayMs?: number
  readonly deltaDelayMs?: number
  readonly chunkSize?: number
}

const DEFAULT_TIMING: Required<TurnTiming> = {
  startDelayMs: 150,
  deltaDelayMs: 40,
  chunkSize: 12,
}

/** Trocea un texto en fragmentos de tamanio fijo para simular tokens. */
export function tokenize(text: string, chunkSize: number): readonly string[] {
  if (chunkSize <= 0) return [text]

  const chunks: string[] = []
  for (let index = 0; index < text.length; index += chunkSize) {
    chunks.push(text.slice(index, index + chunkSize))
  }
  return chunks
}

export async function streamResponse(
  messageId: string,
  markdown: string,
  deps: TurnDeps,
  timing: TurnTiming = {},
): Promise<void> {
  const { startDelayMs, deltaDelayMs, chunkSize } = { ...DEFAULT_TIMING, ...timing }

  await deps.wait(startDelayMs)
  deps.emit({ type: 'message.start', messageId })

  for (const chunk of tokenize(markdown, chunkSize)) {
    await deps.wait(deltaDelayMs)
    deps.emit({ type: 'message.delta', messageId, text: chunk })
  }

  deps.emit({ type: 'message.end', messageId })
}

export async function streamFailure(
  deps: TurnDeps,
  scenario: FailureScenario,
  timing: TurnTiming = {},
): Promise<void> {
  const { startDelayMs } = { ...DEFAULT_TIMING, ...timing }

  await deps.wait(startDelayMs)
  deps.emit({
    type: 'error',
    code: scenario.code,
    message: scenario.message,
    recoverable: scenario.recoverable,
  })
}
