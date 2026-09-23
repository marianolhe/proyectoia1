import { ChatClient, InMemoryTransport } from '@agichat/core'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useChat } from './use-chat.js'

async function connectedClient(options?: ConstructorParameters<typeof InMemoryTransport>[0]) {
  const transport = new InMemoryTransport(options)
  let counter = 0
  const client = new ChatClient({ transport, createMessageId: () => `msg-${++counter}` })
  await client.connect()
  return { client, transport }
}

describe('useChat', () => {
  it('sin cliente expone un estado inerte y rechaza enviar', async () => {
    const { result } = renderHook(() => useChat(null))

    expect(result.current.messages).toEqual([])
    expect(result.current.canSubmit).toBe(false)
    expect(result.current.isResponding).toBe(false)
    await expect(result.current.sendMessage('hola')).resolves.toEqual({
      ok: false,
      reason: 'disconnected',
    })
    // reset sin cliente no debe lanzar.
    expect(() => result.current.reset()).not.toThrow()
  })

  it('devuelve la misma instantanea mientras no hay cliente', () => {
    const { result, rerender } = renderHook(() => useChat(null))
    const first = result.current.state
    rerender()
    expect(result.current.state).toBe(first)
  })

  it('refleja el estado del cliente y lo sigue en cada evento', async () => {
    const { client, transport } = await connectedClient()
    const { result } = renderHook(() => useChat(client))

    expect(result.current.canSubmit).toBe(true)

    await act(async () => {
      await result.current.sendMessage('hola')
    })
    expect(result.current.messages.map((message) => message.content)).toEqual(['hola'])
    expect(result.current.isResponding).toBe(true)
    expect(result.current.canSubmit).toBe(false)

    act(() => transport.respondWith('Buenos dias', 'reply-1'))
    expect(result.current.messages.at(-1)).toMatchObject({
      role: 'assistant',
      content: 'Buenos dias',
      status: 'complete',
    })
    expect(result.current.isResponding).toBe(false)
  })

  it('reset limpia el hilo del cliente', async () => {
    const { client } = await connectedClient({ autoRespond: () => 'ok' })
    const { result } = renderHook(() => useChat(client))

    await act(async () => {
      await result.current.sendMessage('hola')
    })
    expect(result.current.messages).toHaveLength(2)

    act(() => result.current.reset())
    expect(result.current.messages).toEqual([])
  })

  it('se vuelve a suscribir cuando cambia el cliente', async () => {
    const first = await connectedClient()
    const second = await connectedClient({ autoRespond: () => 'segundo' })
    const { result, rerender } = renderHook(({ client }) => useChat(client), {
      initialProps: { client: first.client },
    })

    rerender({ client: second.client })
    await act(async () => {
      await result.current.sendMessage('hola')
    })

    expect(result.current.messages.at(-1)?.content).toBe('segundo')
    expect(first.client.getState().messages).toEqual([])
  })
})
