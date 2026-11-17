import { describe, expect, it } from 'vitest'
import { conversationReducer, createInitialState, type ConversationState } from './conversation.js'

/**
 * Transiciones agregadas en el proyecto 2: imagenes adjuntas y acciones de
 * "abrir pestania".
 */

function run(
  state: ConversationState,
  ...actions: Parameters<typeof conversationReducer>[1][]
): ConversationState {
  return actions.reduce(conversationReducer, state)
}

const WITH_REPLY = run(
  createInitialState('c'),
  { type: 'user/submit', messageId: 'm1', text: 'Hola', at: 1 },
  { type: 'agent/start', messageId: 'r1', at: 2 },
)

const OPEN = {
  type: 'agent/open-url',
  actionId: 'a1',
  url: 'https://www.imdb.com/title/tt1160419/',
  title: 'IMDb: Duna',
} as const

describe('agent/image', () => {
  it('adjunta imagenes al mensaje del agente en orden', () => {
    const state = run(
      WITH_REPLY,
      { type: 'agent/image', messageId: 'r1', url: 'https://image.tmdb.org/a.jpg', alt: 'A' },
      { type: 'agent/image', messageId: 'r1', url: 'https://image.tmdb.org/b.jpg', alt: 'B' },
    )

    expect(state.messages[1]?.images).toEqual([
      { url: 'https://image.tmdb.org/a.jpg', alt: 'A' },
      { url: 'https://image.tmdb.org/b.jpg', alt: 'B' },
    ])
  })

  it('ignora imagenes de un mensaje desconocido', () => {
    const state = conversationReducer(WITH_REPLY, {
      type: 'agent/image',
      messageId: 'otro',
      url: 'https://image.tmdb.org/a.jpg',
      alt: '',
    })
    expect(state).toBe(WITH_REPLY)
  })
})

describe('agent/open-url y action/resolve', () => {
  it('registra la accion como pendiente', () => {
    expect(conversationReducer(WITH_REPLY, OPEN).actions).toEqual([
      { id: 'a1', type: 'open_url', url: OPEN.url, title: OPEN.title, status: 'pending' },
    ])
  })

  it('no duplica una accion repetida tras una reconexion', () => {
    const once = conversationReducer(WITH_REPLY, OPEN)
    expect(conversationReducer(once, OPEN)).toBe(once)
  })

  it('marca el resultado de la accion', () => {
    const state = run(WITH_REPLY, OPEN, {
      type: 'action/resolve',
      actionId: 'a1',
      status: 'opened',
    })
    expect(state.actions[0]?.status).toBe('opened')
  })

  it('no cambia nada si la accion no existe o ya tiene ese estado', () => {
    const pending = conversationReducer(WITH_REPLY, OPEN)
    expect(
      conversationReducer(pending, { type: 'action/resolve', actionId: 'x', status: 'opened' }),
    ).toBe(pending)
    expect(
      conversationReducer(pending, { type: 'action/resolve', actionId: 'a1', status: 'pending' }),
    ).toBe(pending)
  })

  it('reiniciar la conversacion limpia las acciones', () => {
    const state = run(WITH_REPLY, OPEN, { type: 'conversation/reset', conversationId: 'c2' })
    expect(state.actions).toEqual([])
  })
})
