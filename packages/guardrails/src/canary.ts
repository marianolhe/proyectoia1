/**
 * Canario del system prompt (LLM07).
 *
 * Es una cadena aleatoria sin significado que solo existe dentro del system
 * prompt. Si aparece en una respuesta, es prueba de que el prompt se filtro, y
 * no hace falta "entender" la respuesta para detectarlo.
 */

const CANARY_PREFIX = 'AGC'

export type RandomBytes = (length: number) => Uint8Array

const defaultRandomBytes: RandomBytes = (length) => crypto.getRandomValues(new Uint8Array(length))

export function createCanary(randomBytes: RandomBytes = defaultRandomBytes): string {
  const hex = Array.from(randomBytes(12), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${CANARY_PREFIX}-${hex}`
}

function compact(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Busca el canario tambien en las formas tipicas de evasion: con separadores
 * intercalados, al reves o en base64.
 */
export function containsCanary(text: string, canary: string): boolean {
  if (canary.length === 0) return false
  const haystack = compact(text)
  const needle = compact(canary)
  if (haystack.includes(needle)) return true
  if (haystack.includes([...needle].reverse().join(''))) return true
  const base64 = btoa(canary).replace(/=+$/, '')
  return text.includes(base64)
}
