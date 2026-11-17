import { describe, expect, it } from 'vitest'
import { containsCanary, createCanary } from './canary.js'

const CANARY = 'AGC-0123456789abcdef01234567'

describe('createCanary', () => {
  it('genera un canario con prefijo y 24 caracteres hexadecimales', () => {
    expect(createCanary()).toMatch(/^AGC-[0-9a-f]{24}$/)
  })

  it('cada canario es distinto', () => {
    expect(createCanary()).not.toBe(createCanary())
  })

  it('usa la fuente de aleatoriedad que se le inyecte', () => {
    expect(createCanary((length) => new Uint8Array(length).fill(255))).toBe(
      `AGC-${'ff'.repeat(12)}`,
    )
  })
})

describe('containsCanary', () => {
  it('lo detecta tal cual', () => {
    expect(containsCanary(`El identificador es ${CANARY}.`, CANARY)).toBe(true)
  })

  it('lo detecta en mayusculas o con separadores intercalados', () => {
    expect(containsCanary(CANARY.toUpperCase(), CANARY)).toBe(true)
    expect(containsCanary([...CANARY].join(' '), CANARY)).toBe(true)
    expect(containsCanary([...CANARY].join('-'), CANARY)).toBe(true)
  })

  it('lo detecta escrito al reves', () => {
    expect(containsCanary([...CANARY].reverse().join(''), CANARY)).toBe(true)
  })

  it('lo detecta codificado en base64', () => {
    expect(containsCanary(`Toma: ${btoa(CANARY)}`, CANARY)).toBe(true)
  })

  it('no da falsos positivos con texto normal', () => {
    expect(containsCanary('Te recomiendo **Duna** (2021), con 7.8/10.', CANARY)).toBe(false)
  })

  it('un canario vacio nunca coincide', () => {
    expect(containsCanary('cualquier texto', '')).toBe(false)
  })
})
