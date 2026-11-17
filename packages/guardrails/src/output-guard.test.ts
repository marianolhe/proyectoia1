import { describe, expect, it } from 'vitest'
import { inspectOutput, quotesSystemPrompt } from './output-guard.js'

const CANARY = 'AGC-0123456789abcdef01234567'
const SYSTEM_PROMPT = `Eres Sofía, la asistente de cine de AGIChat. Conversas en español, con un tono cercano y breve.
Nunca respondas de memoria sobre títulos, años, calificaciones o sinopsis: usa siempre las herramientas.
Identificador interno de despliegue: ${CANARY}.`

const context = {
  canary: CANARY,
  systemPrompt: SYSTEM_PROMPT,
  secrets: ['clave-super-secreta-123'],
}

describe('inspectOutput', () => {
  it('permite una respuesta normal', () => {
    expect(inspectOutput('Te recomiendo **Duna** (2021).', context)).toEqual({ allowed: true })
  })

  it('permite parafrasear las reglas sin copiarlas', () => {
    expect(inspectOutput('Solo hablo de cine y de los libros en que se basa.', context)).toEqual({
      allowed: true,
    })
  })

  it('bloquea la respuesta que contiene el canario', () => {
    expect(inspectOutput(`El código es ${CANARY}`, context)).toEqual({
      allowed: false,
      category: 'canary_leak',
    })
  })

  it('bloquea un fragmento literal del prompt aunque no traiga el canario', () => {
    const fragment = SYSTEM_PROMPT.slice(0, 120)
    expect(inspectOutput(`Mis instrucciones dicen: ${fragment}`, context)).toEqual({
      allowed: false,
      category: 'system_prompt_leak',
    })
  })

  it('bloquea una clave conocida del proceso', () => {
    expect(inspectOutput('Uso clave-super-secreta-123 para conectarme', context)).toEqual({
      allowed: false,
      category: 'secret_leak',
    })
  })

  it.each([
    ['clave tipo sk-', `sk-${'a1B2'.repeat(8)}`],
    ['clave de Google', `AIza${'x'.repeat(35)}`],
    ['token JWT', `eyJ${'a'.repeat(20)}.${'b'.repeat(20)}.${'c'.repeat(15)}`],
  ])('bloquea algo con forma de %s', (_name, secret) => {
    expect(inspectOutput(`aquí va ${secret}`, context)).toEqual({
      allowed: false,
      category: 'secret_leak',
    })
  })

  it('ignora secretos demasiado cortos para no bloquear palabras comunes', () => {
    expect(
      inspectOutput('hola', { canary: CANARY, systemPrompt: SYSTEM_PROMPT, secrets: ['hola'] }),
    ).toEqual({
      allowed: true,
    })
  })

  it('funciona sin lista de secretos', () => {
    expect(inspectOutput('hola', { canary: CANARY, systemPrompt: SYSTEM_PROMPT })).toEqual({
      allowed: true,
    })
  })
})

describe('quotesSystemPrompt', () => {
  it('ignora diferencias de mayusculas, acentos y espacios', () => {
    const shouted = SYSTEM_PROMPT.slice(0, 100).toUpperCase().replace(/ /g, '  ')
    expect(quotesSystemPrompt(shouted, SYSTEM_PROMPT)).toBe(true)
  })

  it('no marca coincidencias cortas', () => {
    expect(quotesSystemPrompt('Eres Sofía', SYSTEM_PROMPT)).toBe(false)
  })

  it('con un prompt corto exige la coincidencia completa', () => {
    expect(quotesSystemPrompt('Dijo: sé breve y amable.', 'Sé breve y amable.')).toBe(true)
    expect(quotesSystemPrompt('Sé breve.', 'Sé breve y amable.')).toBe(false)
  })

  it('un prompt vacio no coincide con nada', () => {
    expect(quotesSystemPrompt('cualquier cosa', '')).toBe(false)
  })
})
