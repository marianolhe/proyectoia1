import type { LlmClient } from '@agichat/agent-server'
import { FUNCTIONAL_CASES } from './cases/functional.js'
import { LLM01_CASES } from './cases/llm01-prompt-injection.js'
import { LLM07_CASES } from './cases/llm07-system-prompt-leakage.js'
import type { EvalCase, EvalCategory } from './cases/types.js'
import { runTurn } from './harness.js'

export const ALL_CASES: readonly EvalCase[] = [...FUNCTIONAL_CASES, ...LLM01_CASES, ...LLM07_CASES]

export type EvalMode = 'offline' | 'live'

export interface CheckResult {
  readonly description: string
  readonly passed: boolean
}

export interface CaseResult {
  readonly id: string
  readonly category: EvalCategory
  readonly title: string
  readonly rationale: string
  readonly input: string
  readonly reply: string
  readonly passed: boolean
  readonly checks: readonly CheckResult[]
  /** Presente si el turno lanzo una excepcion; cuenta como fallo. */
  readonly error?: string
}

export interface EvalRun {
  readonly mode: EvalMode
  readonly model: string
  readonly results: readonly CaseResult[]
}

export interface RunOptions {
  readonly mode: EvalMode
  /** Nombre del modelo para el reporte. */
  readonly model: string
  /** Modelo real, solo en modo `live`. */
  readonly liveLlm?: LlmClient
  readonly cases?: readonly EvalCase[]
  /**
   * Pausa entre casos. Los planes gratuitos limitan las peticiones por minuto;
   * en modo `live` espaciar los casos evita que fallen por cupo y no por el agente.
   */
  readonly pauseMs?: number
  readonly sleep?: (ms: number) => Promise<void>
}

async function runCase(evalCase: EvalCase, options: RunOptions): Promise<CaseResult> {
  const base = {
    id: evalCase.id,
    category: evalCase.category,
    title: evalCase.title,
    rationale: evalCase.rationale,
    input: evalCase.input.text,
  }
  const live = options.mode === 'live' ? options.liveLlm : undefined

  try {
    const trace = await runTurn(evalCase.input, (systemPrompt) =>
      live === undefined ? evalCase.simulate(systemPrompt) : live,
    )
    const checks = evalCase.checks
      .filter((check) => live === undefined || check.offlineOnly !== true)
      .map((check) => ({ description: check.description, passed: check.passes(trace) }))

    return { ...base, reply: trace.text, checks, passed: checks.every((check) => check.passed) }
  } catch (error) {
    return {
      ...base,
      reply: '',
      checks: [],
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function runEvals(options: RunOptions): Promise<EvalRun> {
  const results: CaseResult[] = []
  // En serie a proposito: en modo `live` evita chocar con el limite de tasa
  // del proveedor, y el orden del reporte queda estable.
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)))
  for (const [index, evalCase] of (options.cases ?? ALL_CASES).entries()) {
    if (index > 0 && options.pauseMs !== undefined && options.pauseMs > 0)
      await sleep(options.pauseMs)
    results.push(await runCase(evalCase, options))
  }
  return { mode: options.mode, model: options.model, results }
}
