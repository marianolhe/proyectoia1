import { EXTRACTION_PATTERNS, INJECTION_PATTERNS, type AttackPattern } from './patterns.js'
import { decodeBase64Segments, normalizeForInspection, stripInvisible } from './text-normalize.js'

/**
 * Primera capa contra LLM01 y LLM07: revisar lo que escribe el usuario antes
 * de gastar una sola llamada al modelo.
 */

export type InputCategory = 'prompt_injection' | 'prompt_extraction' | 'too_long' | 'empty'

export type InputVerdict =
  | { readonly allowed: true; readonly text: string }
  | {
      readonly allowed: false
      readonly category: InputCategory
      /** Identificadores de las reglas que dispararon; van al log, no al usuario. */
      readonly matched: readonly string[]
    }

export interface InputGuardOptions {
  readonly maxLength?: number
}

export const DEFAULT_MAX_INPUT_LENGTH = 2000

function matchAll(patterns: readonly AttackPattern[], candidates: readonly string[]): string[] {
  return patterns
    .filter((pattern) => candidates.some((candidate) => pattern.regex.test(candidate)))
    .map((pattern) => pattern.id)
}

export function inspectUserInput(raw: string, options: InputGuardOptions = {}): InputVerdict {
  const maxLength = options.maxLength ?? DEFAULT_MAX_INPUT_LENGTH
  const text = stripInvisible(raw.normalize('NFKC')).trim()

  if (text.length === 0) return { allowed: false, category: 'empty', matched: [] }
  if (text.length > maxLength) return { allowed: false, category: 'too_long', matched: [] }

  // El mismo filtro ve el texto y lo que venga escondido en base64.
  const candidates = [text, ...decodeBase64Segments(text)].map(normalizeForInspection)

  const injection = matchAll(INJECTION_PATTERNS, candidates)
  if (injection.length > 0) {
    return { allowed: false, category: 'prompt_injection', matched: injection }
  }
  const extraction = matchAll(EXTRACTION_PATTERNS, candidates)
  if (extraction.length > 0) {
    return { allowed: false, category: 'prompt_extraction', matched: extraction }
  }

  return { allowed: true, text }
}
