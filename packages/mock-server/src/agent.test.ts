import type { AgentEvent } from '@agichat/core'
import { describe, expect, it } from 'vitest'
import { runAgentTurn } from './agent.js'
import { SHOWCASE_SCENARIO } from './responses.js'

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

describe('runAgentTurn', () => {
  it('transmite la respuesta de muestra para un mensaje normal', async () => {
    const { events, deps } = immediateDeps()

    await runAgentTurn({ conversationId: 'c', messageId: 'msg-1', text: 'hola' }, deps)

    expect(events[0]).toEqual({ type: 'message.start', messageId: 'msg-1-reply' })
    expect(events.at(-1)).toEqual({ type: 'message.end', messageId: 'msg-1-reply' })

    const rebuilt = events
      .filter((event) => event.type === 'message.delta')
      .map((event) => (event.type === 'message.delta' ? event.text : ''))
      .join('')
    expect(rebuilt).toBe(SHOWCASE_SCENARIO.markdown)
  })

  it('emite un error en lugar de una respuesta cuando el texto pide fallar', async () => {
    const { events, deps } = immediateDeps()

    await runAgentTurn({ conversationId: 'c', messageId: 'msg-2', text: 'provoca un error' }, deps)

    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe('error')
  })
})
