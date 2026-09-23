import { describe, expect, it } from 'vitest'
import {
  canSubmit,
  conversationReducer,
  createInitialState,
  isAgentResponding,
  type ConversationState,
} from './conversation.js'

const BASE = createInitialState('conv-1')

/** Aplica una secuencia de acciones y devuelve el estado final. */
function run(
  state: ConversationState,
  ...actions: Parameters<typeof conversationReducer>[1][]
): ConversationState {
  return actions.reduce(conversationReducer, state)
}

describe('createInitialState', () => {
  it('arranca vacia, ociosa y sin error', () => {
    expect(BASE).toEqual({
      conversationId: 'conv-1',
      messages: [],
      phase: 'idle',
      connection: 'idle',
      error: null,
    })
  })
})

describe('user/submit', () => {
  it('agrega el mensaje del usuario ya completo y pasa a sending', () => {
    const state = run(BASE, { type: 'user/submit', messageId: 'm1', text: 'Hola', at: 100 })

    expect(state.messages).toHaveLength(1)
    expect(state.messages[0]).toEqual({
      id: 'm1',
      role: 'user',
      content: 'Hola',
      status: 'complete',
      createdAt: 100,
    })
    expect(state.phase).toBe('sending')
  })

  it('limpia el error anterior: un intento nuevo no arrastra el fallo previo', () => {
    const withError = run(BASE, {
      type: 'transport/error',
      error: { code: 'x', message: 'fallo', recoverable: true },
    })
    const state = run(withError, { type: 'user/submit', messageId: 'm1', text: 'Hola', at: 1 })

    expect(state.error).toBeNull()
  })
})

describe('streaming de la respuesta del agente', () => {
  const started = run(
    BASE,
    { type: 'user/submit', messageId: 'm1', text: 'Hola', at: 1 },
    { type: 'agent/start', messageId: 'a1', at: 2 },
  )

  it('crea un mensaje vacio en estado streaming', () => {
    expect(started.phase).toBe('streaming')
    expect(started.messages[1]).toMatchObject({
      role: 'assistant',
      content: '',
      status: 'streaming',
    })
  })

  it('concatena los deltas en orden de llegada', () => {
    const state = run(
      started,
      { type: 'agent/delta', messageId: 'a1', text: '# Hola' },
      { type: 'agent/delta', messageId: 'a1', text: '\n\nsoy **Sofia**' },
    )

    expect(state.messages[1]?.content).toBe('# Hola\n\nsoy **Sofia**')
  })

  it('cierra el mensaje y vuelve a idle al terminar', () => {
    const state = run(
      started,
      { type: 'agent/delta', messageId: 'a1', text: 'listo' },
      { type: 'agent/end', messageId: 'a1' },
    )

    expect(state.messages[1]).toMatchObject({ content: 'listo', status: 'complete' })
    expect(state.phase).toBe('idle')
  })

  it('no duplica el mensaje si el agente reenvia start tras reconectar', () => {
    const state = run(started, { type: 'agent/start', messageId: 'a1', at: 9 })

    expect(state.messages).toHaveLength(2)
    expect(state.phase).toBe('streaming')
  })

  it('descarta deltas de un mensaje desconocido sin alterar el estado', () => {
    const state = conversationReducer(started, {
      type: 'agent/delta',
      messageId: 'fantasma',
      text: 'ruido',
    })

    expect(state).toBe(started)
  })

  it('descarta un end de un mensaje desconocido', () => {
    const state = conversationReducer(started, { type: 'agent/end', messageId: 'fantasma' })

    expect(state).toBe(started)
  })
})

describe('transport/status', () => {
  it('registra el cambio de estado del canal', () => {
    const state = run(BASE, { type: 'transport/status', status: 'open' })

    expect(state.connection).toBe('open')
  })

  it('ignora un estado repetido y conserva la referencia', () => {
    const open = run(BASE, { type: 'transport/status', status: 'open' })
    const again = conversationReducer(open, { type: 'transport/status', status: 'open' })

    expect(again).toBe(open)
  })

  it('marca como fallida la respuesta a medias cuando el canal muere', () => {
    const streaming = run(
      BASE,
      { type: 'transport/status', status: 'open' },
      { type: 'agent/start', messageId: 'a1', at: 1 },
      { type: 'agent/delta', messageId: 'a1', text: 'a medio ' },
      { type: 'transport/status', status: 'closed' },
    )

    // El texto recibido se conserva: perder la conexion no borra lo leido.
    expect(streaming.messages[0]).toMatchObject({ content: 'a medio ', status: 'error' })
    expect(streaming.phase).toBe('idle')
  })

  it('al morir el canal solo falla la respuesta a medias, no el mensaje del usuario', () => {
    const state = run(
      BASE,
      { type: 'transport/status', status: 'open' },
      { type: 'user/submit', messageId: 'm1', text: 'Hola', at: 1 },
      { type: 'agent/start', messageId: 'a1', at: 2 },
      { type: 'agent/delta', messageId: 'a1', text: 'parcial' },
      { type: 'transport/status', status: 'closed' },
    )

    expect(state.messages[0]).toMatchObject({ role: 'user', status: 'complete' })
    expect(state.messages[1]).toMatchObject({ role: 'assistant', status: 'error' })
  })

  it('no toca los mensajes ya completos al cerrarse el canal', () => {
    const completed = run(
      BASE,
      { type: 'transport/status', status: 'open' },
      { type: 'agent/start', messageId: 'a1', at: 1 },
      { type: 'agent/end', messageId: 'a1' },
    )
    const closed = conversationReducer(completed, { type: 'transport/status', status: 'error' })

    expect(closed.messages[0]?.status).toBe('complete')
    expect(closed.connection).toBe('error')
  })
})

describe('transport/error', () => {
  it('guarda el error, cierra el streaming y vuelve a idle', () => {
    const state = run(
      BASE,
      { type: 'agent/start', messageId: 'a1', at: 1 },
      { type: 'agent/delta', messageId: 'a1', text: 'parcial' },
      {
        type: 'transport/error',
        error: { code: 'agent_timeout', message: 'El agente no respondio.', recoverable: true },
      },
    )

    expect(state.error).toEqual({
      code: 'agent_timeout',
      message: 'El agente no respondio.',
      recoverable: true,
    })
    expect(state.messages[0]?.status).toBe('error')
    expect(state.phase).toBe('idle')
  })
})

describe('conversation/reset', () => {
  it('vacia el hilo pero preserva el estado de la conexion', () => {
    const state = run(
      BASE,
      { type: 'transport/status', status: 'open' },
      { type: 'user/submit', messageId: 'm1', text: 'Hola', at: 1 },
      { type: 'conversation/reset', conversationId: 'conv-2' },
    )

    expect(state.messages).toHaveLength(0)
    expect(state.conversationId).toBe('conv-2')
    expect(state.connection).toBe('open')
  })
})

describe('selectores', () => {
  it('isAgentResponding cubre sending y streaming', () => {
    expect(isAgentResponding({ ...BASE, phase: 'idle' })).toBe(false)
    expect(isAgentResponding({ ...BASE, phase: 'sending' })).toBe(true)
    expect(isAgentResponding({ ...BASE, phase: 'streaming' })).toBe(true)
  })

  it('canSubmit exige conversacion ociosa y canal abierto', () => {
    expect(canSubmit({ ...BASE, phase: 'idle', connection: 'open' })).toBe(true)
    expect(canSubmit({ ...BASE, phase: 'streaming', connection: 'open' })).toBe(false)
    expect(canSubmit({ ...BASE, phase: 'idle', connection: 'connecting' })).toBe(false)
  })
})
