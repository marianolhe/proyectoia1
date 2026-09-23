import type { AgentEvent } from '@agichat/core'
import { describe, expect, it } from 'vitest'
import { FAILURE_SCENARIO } from './responses.js'
import { streamFailure, streamResponse, tokenize } from './streaming.js'

function immediateDeps() {
  const events: AgentEvent[] = []
  return {
    events,
    deps: {
      emit: (event: AgentEvent) => events.push(event),
      wait: () => Promise.resolve(),
    },
  }
}

describe('tokenize', () => {
  it('trocea el texto en fragmentos del tamanio pedido', () => {
    expect(tokenize('abcdefgh', 3)).toEqual(['abc', 'def', 'gh'])
  })

  it('devuelve el texto completo si el tamanio es cero o negativo', () => {
    expect(tokenize('abc', 0)).toEqual(['abc'])
    expect(tokenize('abc', -1)).toEqual(['abc'])
  })

  it('devuelve un arreglo vacio para texto vacio', () => {
    expect(tokenize('', 4)).toEqual([])
  })
})

describe('streamResponse', () => {
  it('emite start, los deltas en orden y end, sin esperas reales', async () => {
    const { events, deps } = immediateDeps()

    await streamResponse('msg-1', 'hola mundo', deps, { chunkSize: 4 })

    expect(events[0]).toEqual({ type: 'message.start', messageId: 'msg-1' })
    expect(events.at(-1)).toEqual({ type: 'message.end', messageId: 'msg-1' })

    const deltas = events.filter((event) => event.type === 'message.delta')
    const rebuilt = deltas.map((event) => (event.type === 'message.delta' ? event.text : '')).join('')
    expect(rebuilt).toBe('hola mundo')
  })

  it('usa los tiempos inyectados en lugar de temporizadores reales', async () => {
    const waited: number[] = []
    const events: AgentEvent[] = []

    await streamResponse(
      'msg-2',
      'ab',
      {
        emit: (event) => events.push(event),
        wait: (ms) => {
          waited.push(ms)
          return Promise.resolve()
        },
      },
      { startDelayMs: 5, deltaDelayMs: 1, chunkSize: 1 },
    )

    // Una espera antes del start y una por cada delta (dos caracteres).
    expect(waited).toEqual([5, 1, 1])
    expect(events).toHaveLength(4)
  })
})

describe('streamFailure', () => {
  it('emite un unico evento de error con los datos del escenario', async () => {
    const { events, deps } = immediateDeps()

    await streamFailure(deps, FAILURE_SCENARIO)

    expect(events).toEqual([
      {
        type: 'error',
        code: FAILURE_SCENARIO.code,
        message: FAILURE_SCENARIO.message,
        recoverable: FAILURE_SCENARIO.recoverable,
      },
    ])
  })
})
