/**
 * Normalizacion previa a cualquier inspeccion.
 *
 * Los patrones de ataque se comparan contra una forma canonica del texto, no
 * contra lo que el usuario tecleo: asi una orden escrita en mayusculas, con
 * letras de ancho completo o con caracteres invisibles intercalados cae en la
 * misma regla que su version simple.
 */

const COMBINING_MARKS = /[\u0300-\u036f]/g

/**
 * Rangos de caracteres que no se ven: controles ASCII (salvo tabulador y
 * saltos de linea), guion suave, marcas de ancho cero y de direccion, y BOM.
 * Se comparan por codigo en vez de con una expresion regular porque una
 * clase con caracteres de control es justo lo que la regla de lint prohibe
 * por ser ilegible.
 */
const INVISIBLE_RANGES: readonly (readonly [number, number])[] = [
  [0x00, 0x08],
  [0x0b, 0x0c],
  [0x0e, 0x1f],
  [0x7f, 0x7f],
  [0xad, 0xad],
  [0x200b, 0x200f],
  [0x2028, 0x202f],
  [0x2060, 0x2064],
  [0xfeff, 0xfeff],
]

function isInvisible(char: string): boolean {
  const code = char.codePointAt(0) ?? 0
  return INVISIBLE_RANGES.some(([from, to]) => code >= from && code <= to)
}

/** Quita caracteres invisibles y de control sin alterar el resto del texto. */
export function stripInvisible(text: string): string {
  let result = ''
  for (const char of text) if (!isInvisible(char)) result += char
  return result
}

/** Forma canonica para comparar: sin invisibles, sin acentos, en minusculas. */
export function normalizeForInspection(text: string): string {
  return stripInvisible(text.normalize('NFKC'))
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

const BASE64_SEGMENT = /[A-Za-z0-9+/_-]{24,}={0,2}/g

function isMostlyPrintable(text: string): boolean {
  if (text.length === 0) return false
  let printable = 0
  let total = 0
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    total += 1
    if (code === 10 || (code >= 32 && code !== 0xfffd)) printable += 1
  }
  return printable / total > 0.9
}

/**
 * Devuelve el texto escondido en segmentos base64. Un atacante codifica la
 * orden para saltarse los patrones; decodificarla la devuelve al mismo filtro.
 */
export function decodeBase64Segments(text: string): string[] {
  const decoded: string[] = []
  for (const match of text.match(BASE64_SEGMENT) ?? []) {
    const standard = match.replace(/-/g, '+').replace(/_/g, '/')
    let candidate: string
    try {
      candidate = new TextDecoder().decode(Uint8Array.from(atob(standard), (c) => c.charCodeAt(0)))
    } catch {
      continue
    }
    if (isMostlyPrintable(candidate)) decoded.push(candidate)
  }
  return decoded
}
