import { describe, expect, it } from 'vitest'
import { parseAgentEvent } from './parse-agent-event.js'

const json = (value: unknown) => JSON.stringify(value)

describe('parseAgentEvent', () => {
  it.each([
    [{ type: 'message.start', messageId: 'a' }],
    [{ type: 'message.end', messageId: 'a' }],
    [{ type: 'message.delta', messageId: 'a', text: 'hola' }],
    [{ type: 'error', code: 'x', message: 'fallo', recoverable: true }],
  ])('acepta el evento valido %j', (event) => {
    expect(parseAgentEvent(json(event))).toEqual(event)
  })

  it('trata recoverable ausente como no recuperable', () => {
    expect(parseAgentEvent(json({ type: 'error', code: 'x', message: 'm' }))).toMatchObject({
      recoverable: false,
    })
  })

  it('descarta campos extra en lugar de propagarlos', () => {
    expect(parseAgentEvent(json({ type: 'message.end', messageId: 'a', extra: 1 }))).toEqual({
      type: 'message.end',
      messageId: 'a',
    })
  })

  it.each([
    ['binario', new Uint8Array([1])],
    ['JSON roto', '{no es json'],
    ['un arreglo', json([1])],
    ['null', 'null'],
    ['un tipo desconocido', json({ type: 'otro' })],
    ['start sin messageId', json({ type: 'message.start' })],
    ['delta sin messageId', json({ type: 'message.delta', text: 'x' })],
    ['delta sin text', json({ type: 'message.delta', messageId: 'a' })],
    ['error sin code', json({ type: 'error', message: 'm' })],
  ])('convierte %s en un error recuperable', (_label, data) => {
    expect(parseAgentEvent(data)).toMatchObject({
      type: 'error',
      code: 'invalid_event',
      recoverable: true,
    })
  })
})
