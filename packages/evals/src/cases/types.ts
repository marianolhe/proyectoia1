import type { LlmClient } from '@agichat/agent-server'
import type { Check } from '../checks.js'
import type { TurnInput } from '../harness.js'

export type EvalCategory = 'funcional' | 'LLM01' | 'LLM07'

export interface EvalCheck extends Check {
  /**
   * Comprobacion que solo tiene sentido con el modelo simulado. Ejemplo: "la
   * revision de salida bloqueo la fuga" exige que el modelo haya filtrado el
   * prompt, cosa que un modelo real normalmente no hara.
   */
  readonly offlineOnly?: boolean
}

export interface EvalCase {
  readonly id: string
  readonly category: EvalCategory
  readonly title: string
  /** Que se busca demostrar, en una frase para el reporte. */
  readonly rationale: string
  readonly input: TurnInput
  /** Modelo simulado del modo sin conexion. Recibe el system prompt real. */
  simulate(systemPrompt: string): LlmClient
  readonly checks: readonly EvalCheck[]
}

export function offlineOnly(check: Check): EvalCheck {
  return { ...check, offlineOnly: true }
}
