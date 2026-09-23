import { afterEach, describe, expect, it, vi } from 'vitest'
import { createId } from './ids.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createId', () => {
  it('usa crypto.randomUUID cuando el entorno lo expone', () => {
    const randomUUID = vi.fn(() => '11111111-2222-3333-4444-555555555555')
    vi.stubGlobal('crypto', { randomUUID })

    expect(createId()).toBe('11111111-2222-3333-4444-555555555555')
    expect(randomUUID).toHaveBeenCalledOnce()
  })

  it('recurre a un identificador propio si randomUUID no existe', () => {
    // Navegadores antiguos y contextos no seguros: el SDK corre en sitios de
    // terceros, asi que no puede asumir la API moderna.
    vi.stubGlobal('crypto', {})

    const first = createId()
    const second = createId()

    expect(first).toMatch(/^agichat-/)
    expect(first).not.toBe(second)
  })

  it('recurre tambien cuando crypto no esta definido', () => {
    vi.stubGlobal('crypto', undefined)

    expect(createId()).toMatch(/^agichat-/)
  })
})
