import { describe, expect, it } from 'vitest'
import { parseInboundFrame, parseInboundJson } from './protocol.js'

describe('parseInboundFrame', () => {
  it('acepta una trama valida', () => {
    const result = parseInboundFrame({
      conversationId: 'conv-1',
      messageId: 'msg-1',
      text: 'hola',
    })

    expect(result).toEqual({
      ok: true,
      message: { conversationId: 'conv-1', messageId: 'msg-1', text: 'hola' },
    })
  })

  it('rechaza un valor que no es objeto', () => {
    expect(parseInboundFrame('hola').ok).toBe(false)
    expect(parseInboundFrame(42).ok).toBe(false)
    expect(parseInboundFrame(null).ok).toBe(false)
  })

  it('rechaza un arreglo', () => {
    expect(parseInboundFrame([]).ok).toBe(false)
  })

  it('rechaza cuando falta conversationId', () => {
    const result = parseInboundFrame({ messageId: 'msg-1', text: 'hola' })
    expect(result).toEqual({ ok: false, reason: expect.stringContaining('conversationId') })
  })

  it('rechaza cuando conversationId no es cadena', () => {
    const result = parseInboundFrame({ conversationId: 1, messageId: 'msg-1', text: 'hola' })
    expect(result.ok).toBe(false)
  })

  it('rechaza cuando falta messageId', () => {
    const result = parseInboundFrame({ conversationId: 'conv-1', text: 'hola' })
    expect(result).toEqual({ ok: false, reason: expect.stringContaining('messageId') })
  })

  it('rechaza cuando text no es cadena', () => {
    const result = parseInboundFrame({ conversationId: 'c', messageId: 'm', text: 123 })
    expect(result).toEqual({ ok: false, reason: expect.stringContaining('text debe ser') })
  })

  it('rechaza cuando text esta vacio o solo tiene espacios', () => {
    const result = parseInboundFrame({ conversationId: 'c', messageId: 'm', text: '   ' })
    expect(result).toEqual({ ok: false, reason: expect.stringContaining('text no puede estar vacio') })
  })
})

describe('parseInboundJson', () => {
  it('parsea JSON valido y delega en la validacion de campos', () => {
    const raw = JSON.stringify({ conversationId: 'c', messageId: 'm', text: 'hola' })
    expect(parseInboundJson(raw)).toEqual({
      ok: true,
      message: { conversationId: 'c', messageId: 'm', text: 'hola' },
    })
  })

  it('rechaza texto que no es JSON', () => {
    const result = parseInboundJson('{esto no es json')
    expect(result).toEqual({ ok: false, reason: expect.stringContaining('JSON valido') })
  })
})
