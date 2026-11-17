import { containsCanary } from './canary.js'
import { normalizeForInspection } from './text-normalize.js'

/**
 * Ultima capa: revisar la respuesta completa antes de que salga hacia el
 * widget. Por eso el backend no transmite los tokens del modelo en vivo: una
 * fuga detectada despues de enviada ya no se puede retirar.
 */

export type OutputCategory = 'canary_leak' | 'system_prompt_leak' | 'secret_leak'

export type OutputVerdict =
  { readonly allowed: true } | { readonly allowed: false; readonly category: OutputCategory }

export interface OutputGuardContext {
  readonly canary: string
  readonly systemPrompt: string
  /** Valores sensibles del proceso (claves de API). Nunca deben verse en una respuesta. */
  readonly secrets?: readonly string[]
}

/** Longitud minima de coincidencia literal con el system prompt para llamarla fuga. */
const LEAK_WINDOW = 60
const LEAK_STEP = 20
const MIN_SECRET_LENGTH = 8

const SECRET_SHAPES: readonly RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{20,}/,
  /\bAIza[0-9A-Za-z_-]{30,}/,
  /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/,
]

/**
 * Detecta copias literales de fragmentos del prompt. Parafrasear una regla
 * ("solo hablo de cine") es inofensivo y hasta util; reproducir 60 caracteres
 * seguidos no ocurre por casualidad.
 */
export function quotesSystemPrompt(output: string, systemPrompt: string): boolean {
  const haystack = normalizeForInspection(output)
  const prompt = normalizeForInspection(systemPrompt)
  if (prompt.length < LEAK_WINDOW) return prompt.length > 0 && haystack.includes(prompt)

  for (let start = 0; start + LEAK_WINDOW <= prompt.length; start += LEAK_STEP) {
    if (haystack.includes(prompt.slice(start, start + LEAK_WINDOW))) return true
  }
  return false
}

export function inspectOutput(output: string, context: OutputGuardContext): OutputVerdict {
  if (containsCanary(output, context.canary)) {
    return { allowed: false, category: 'canary_leak' }
  }
  if (quotesSystemPrompt(output, context.systemPrompt)) {
    return { allowed: false, category: 'system_prompt_leak' }
  }

  const knownSecrets = (context.secrets ?? []).filter(
    (secret) => secret.length >= MIN_SECRET_LENGTH,
  )
  const leaksKnown = knownSecrets.some((secret) => output.includes(secret))
  const leaksShape = SECRET_SHAPES.some((shape) => shape.test(output))
  if (leaksKnown || leaksShape) return { allowed: false, category: 'secret_leak' }

  return { allowed: true }
}
