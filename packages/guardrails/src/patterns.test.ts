import { describe, expect, it } from 'vitest'
import { EXTRACTION_PATTERNS, INJECTION_PATTERNS } from './patterns.js'

describe('patrones de ataque', () => {
  const all = [...INJECTION_PATTERNS, ...EXTRACTION_PATTERNS]

  it('cada patron tiene un identificador unico', () => {
    const ids = all.map((pattern) => pattern.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('ningun patron usa banderas con estado', () => {
    // Con la bandera g o y, `test` recuerda la posicion y el mismo texto
    // alternaria entre coincidir y no coincidir en llamadas sucesivas.
    for (const pattern of all) {
      expect(pattern.regex.global).toBe(false)
      expect(pattern.regex.sticky).toBe(false)
    }
  })

  it('una peticion normal de cine no coincide con ninguno', () => {
    const text = 'recomiendame una pelicula de ciencia ficcion basada en un libro'
    expect(all.filter((pattern) => pattern.regex.test(text))).toEqual([])
  })
})
